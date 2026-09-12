// Once per authorized account: fixed synthetic samples only, no customer records.
// Results are private (service_role table); credentials and grant tokens are never stored.
import { OCR_FIXTURE } from './providerFixture.ts'
export async function checkProviders() {
 const result:Record<string,unknown>={checked_at:new Date().toISOString()}
 async function check(name:string,work:()=>Promise<unknown>){try{result[name]={ok:true,...await work() as object}}catch(e){result[name]={ok:false,error:e instanceof Error?e.message:'request_failed'}}}
 async function call(url:string,keyName:string,body:unknown,scheme='Bearer'){
  const key=Deno.env.get(keyName);if(!key)throw new Error('missing_configuration')
  const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:`${scheme} ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)})
  if(!response.ok)throw new Error(`upstream_http_${response.status}`)
  return response
 }
 await Promise.all([
  check('mistral_ocr',async()=>{
   const response=await call('https://api.mistral.ai/v1/ocr','MISTRAL_API_KEY',{model:'mistral-ocr-latest',document:{type:'image_url',image_url:OCR_FIXTURE}})
   const body=await response.json();const text=(body.pages||[]).map((p:{markdown:string})=>p.markdown).join(' ')
   if(!/COOK PILOT SAFE/i.test(text))throw new Error('ocr_sample_not_recognized')
   return {http_status:response.status,model:body.model,sample_recognized:true}
  }),
  check('deepseek',async()=>{
   const model=Deno.env.get('DEEPSEEK_MODEL')||'deepseek-v4-flash'
   const response=await call('https://api.deepseek.com/chat/completions','DEEPSEEK_API_KEY',{model,thinking:{type:'disabled'},messages:[{role:'user',content:'Return only this JSON: {"check":"ok"}'}],response_format:{type:'json_object'},max_tokens:64})
   const body=await response.json();if(JSON.parse(body.choices?.[0]?.message?.content||'{}').check!=='ok')throw new Error('invalid_sample_response')
   return {http_status:response.status,model:body.model,json_valid:true}
  }),
  check('deepgram_grant',async()=>{
   const response=await call('https://api.deepgram.com/v1/auth/grant','DEEPGRAM_API_KEY',{},'Token')
   const body=await response.json();if(!body.access_token)throw new Error('missing_access_token')
   return {http_status:response.status,temporary_token_created:true}
  }),
  check('deepgram_voice_roundtrip',async()=>{
   const response=await call('https://api.deepgram.com/v1/speak?model=aura-2-agathe-fr&encoding=linear16&container=wav','DEEPGRAM_API_KEY',{text:'Le réfrigérateur est à trois degrés.'},'Token')
   const bytes=await response.arrayBuffer();if(bytes.byteLength<100)throw new Error('empty_audio')
   const transcription=await fetch('https://api.deepgram.com/v1/listen?model=nova-2&language=fr&smart_format=true',{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:`Token ${Deno.env.get('DEEPGRAM_API_KEY')}`,'Content-Type':'audio/wav'},body:bytes})
   if(!transcription.ok)throw new Error(`transcription_http_${transcription.status}`)
   const body=await transcription.json();const text=body.results?.channels?.[0]?.alternatives?.[0]?.transcript||''
   if(!/r[ée]frig[ée]rateur/i.test(text)||!/(trois|3)/i.test(text))throw new Error('voice_sample_not_recognized')
   return {tts_http_status:response.status,stt_http_status:transcription.status,audio_bytes:bytes.byteLength,transcript:text}
  }),
 ])
 return result
}
