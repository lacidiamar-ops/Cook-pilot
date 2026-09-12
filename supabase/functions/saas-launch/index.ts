import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2.108.2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const APP_URLS: Record<string,string> = {
  center: 'https://cook-pilot-gestion.vercel.app',
  safe: 'https://cook-pilot-haccp.vercel.app',
  human: 'https://cook-pilot-human.vercel.app/saas.html',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
function b64url(bytes: Uint8Array) {
  let value=''; for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash)).map(byte=>byte.toString(16).padStart(2,'0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user || user.is_anonymous) return json({ success:false,error:'unauthorized' },401)

    const { app, establishment_id } = await req.json()
    if (!APP_URLS[app]) return json({ success:false,error:'unknown_app' },400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let query = admin.from('cp_saas_access').select('establishment_id,role,center_enabled,safe_enabled,human_enabled,is_active').eq('user_id', user.id).eq('is_active', true)
    if (establishment_id) query = query.eq('establishment_id', establishment_id)
    const { data: accesses, error: accessError } = await query.limit(1)
    if (accessError || !accesses?.length) return json({ success:false,error:'access_denied' },403)
    const access = accesses[0]
    if ((app==='center' && !access.center_enabled) || (app==='safe' && !access.safe_enabled) || (app==='human' && !access.human_enabled)) return json({ success:false,error:'module_disabled' },403)

    const {data:account}=await admin.from('cp_saas_accounts').select('status').eq('user_id',user.id).maybeSingle()
    if(account?.status!=='active')return json({success:false,error:'account_inactive'},403)
    const raw = b64url(crypto.getRandomValues(new Uint8Array(32)))
    const tokenHash = await sha256(raw)
    await admin.from('cp_saas_launch_tokens').delete().eq('user_id',user.id).eq('app',app).is('used_at',null)
    const { error: insertError } = await admin.from('cp_saas_launch_tokens').insert({
      token_hash: tokenHash,
      user_id: user.id,
      establishment_id: access.establishment_id,
      app,
      expires_at: new Date(Date.now()+5*60_000).toISOString(),
    })
    if (insertError) throw insertError

    const url = new URL(APP_URLS[app])
    url.searchParams.set('cp_launch', raw)
    url.searchParams.set('cp_app', app)
    return json({ success:true, app, establishment_id:access.establishment_id, launch_url:url.toString(), expires_in:300 })
  } catch (error) {
    return json({ success:false,error:error instanceof Error?error.message:'launch_failed' },500)
  }
})

