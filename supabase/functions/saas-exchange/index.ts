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
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control':'no-store' } })
}
async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(hash)).map(byte=>byte.toString(16).padStart(2,'0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ success:false,error:'method_not_allowed' },405)
  try {
    const { token, app } = await req.json()
    if (!token || !APP_URLS[app]) return json({ success:false,error:'invalid_request' },400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth:{persistSession:false,autoRefreshToken:false} })
    const { data, error } = await admin.rpc('cp_exchange_saas_launch_sso', {
      p_token_hash: await sha256(String(token)),
      p_app: String(app),
    })
    if (error) throw error
    const access = Array.isArray(data) ? data[0] : data
    if (!access?.user_id || !access?.email) return json({ success:false,error:'invalid_or_expired' },401)

    const redirectUrl = new URL(APP_URLS[app])
    redirectUrl.searchParams.set('cp_sso','1')
    redirectUrl.searchParams.set('cp_app',app)
    redirectUrl.searchParams.set('cp_establishment',access.establishment_id)
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type:'magiclink',
      email:access.email,
      options:{ redirectTo:redirectUrl.toString() },
    })
    if (linkError || !link?.properties?.action_link) throw linkError || new Error('magic_link_failed')

    redirectUrl.searchParams.set('token_hash',link.properties.hashed_token)
    redirectUrl.searchParams.set('type','magiclink')
    return json({ success:true, action_link:redirectUrl.toString(), app, establishment_id:access.establishment_id, display_name:access.display_name })
  } catch (error) {
    return json({ success:false,error:error instanceof Error?error.message:'exchange_failed' },500)
  }
})

