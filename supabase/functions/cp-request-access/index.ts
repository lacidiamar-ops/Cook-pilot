import { createClient } from 'jsr:@supabase/supabase-js@2.108.2'
import { sendClientInvitation } from '../_shared/clientInvitation.ts'
const origins=['https://cook-pilot-rho.vercel.app','https://cook-pilot-gestion.vercel.app','https://cook-pilot-haccp.vercel.app','https://cook-pilot-human.vercel.app']
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||''
 const headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'}
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers})
 if(req.method==='OPTIONS')return new Response(null,{headers})
 if(req.method!=='POST')return json({success:false},405)
 try{
  const raw=await req.text();if(raw.length>4096)return json({success:false},413)
  const body=JSON.parse(raw);const email=String(body.email||'').trim().toLowerCase()
  if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({success:false},400)
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
  await sendClientInvitation(admin,email,String(body.app||'center'))
  return json({success:true})
 }catch(error){console.error('Client invitation',error instanceof Error?error.message:'failed');return json({success:false,error:'Envoi indisponible. Réessayez dans quelques minutes.'},503)}
})
