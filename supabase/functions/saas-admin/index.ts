import { checkProviders } from '../_shared/providerChecks.ts'
import { sendClientInvitation } from '../_shared/clientInvitation.ts'
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2.108.2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}})}
function randomPassword(length=18){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';const bytes=crypto.getRandomValues(new Uint8Array(length));return Array.from(bytes,b=>alphabet[b%alphabet.length]).join('')}
function randomPin(){return String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0')}
function cleanText(value:unknown,max=180){return String(value??'').trim().slice(0,max)}
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function b64url(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function sha256(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}

async function createDeviceLink(admin:any,establishmentId:string,app:'human'|'safe'){
  const meta=app==='human'
    ? {scope:'human',label:'Téléphones salariés Human',base:'https://cook-pilot-human.vercel.app/'}
    : {scope:'haccp',label:'Tablette cuisine Safe',base:'https://cook-pilot-haccp.vercel.app/'}
  const raw=b64url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash=await sha256(raw)
  const {data:existing}=await admin.from('cpg_device_accounts').select('id').eq('establishment_id',establishmentId).eq('app_scope',meta.scope).maybeSingle()
  if(existing?.id){
    const {error}=await admin.from('cpg_device_accounts').update({device_token_hash:tokenHash,active:true,revoked_at:null,last_seen_at:null,label:meta.label}).eq('id',existing.id)
    if(error)throw error
  }else{
    const {error}=await admin.from('cpg_device_accounts').insert({
      establishment_id:establishmentId,
      device_email:`device+${app}-${establishmentId}@cookpilot.app`,
      app_scope:meta.scope,
      label:meta.label,
      active:true,
      device_token_hash:tokenHash,
    })
    if(error)throw error
  }
  const url=new URL(meta.base)
  url.searchParams.set('cp_establishment',establishmentId)
  url.searchParams.set('cp_pair',raw)
  return url.toString()
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({success:false,error:'method_not_allowed'},405)

  const authHeader=req.headers.get('Authorization')||''
  const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authHeader}}})
  const{data:{user},error:userError}=await userClient.auth.getUser()
  if(userError||!user||user.is_anonymous)return json({success:false,error:'unauthorized'},401)

  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
  const{data:adminProfile}=await admin.from('center_profiles').select('id,is_platform_admin').eq('id',user.id).maybeSingle()
  if(!adminProfile?.is_platform_admin)return json({success:false,error:'platform_admin_required'},403)

  try{
    const raw=await req.text();if(raw.length>16384)return json({success:false,error:'request_too_large'},413)
    const body=JSON.parse(raw)
    const action=String(body?.action||'overview')

    if(action==='provider_checks'){return json({success:true,checks:await checkProviders()})}

    if(action==='overview'){
      const today=new Date().toISOString().slice(0,10)
      const[establishmentsResult,accountsResult,accessResult,onboardingResult,tasksResult]=await Promise.all([
        admin.from('cpg_establishments').select('id,name,siret,address,city,postal_code,phone,email,gestion_enabled,haccp_enabled,human_enabled,created_at').order('created_at',{ascending:false}).limit(200),
        admin.from('cp_saas_accounts').select('user_id,email,display_name,account_type,status,must_change_password,created_at').order('created_at',{ascending:false}).limit(300),
        admin.from('cp_saas_access').select('user_id,establishment_id,role,center_enabled,safe_enabled,human_enabled,is_active,created_at').limit(500),
        admin.from('cook_pilot_company_onboarding').select('establishment_id,legal_name,trade_name,contact_name,contact_email,status,completion_score,readiness_score,activation_status,activated_at,modules').limit(200),
        admin.from('cp_daily_tasks').select('establishment_id,status,app').eq('work_date',today).limit(3000),
      ])
      for(const result of [establishmentsResult,accountsResult,accessResult,onboardingResult,tasksResult])if(result.error)throw result.error
      const {data:invitations,error:invitationError}=await admin.from('cp_client_invitations').select('establishment_id,delivery_status,last_requested_at')
      if(invitationError)throw invitationError
      const establishments=establishmentsResult.data||[]
      const accounts=accountsResult.data||[]
      const accesses=accessResult.data||[]
      const onboardings=onboardingResult.data||[]
      const tasks=tasksResult.data||[]
      const rows=establishments.map(establishment=>{
        const establishmentAccess=accesses.filter(row=>row.establishment_id===establishment.id)
        const ownerAccess=establishmentAccess.find(row=>row.role==='owner')
        const owner=accounts.find(row=>row.user_id===ownerAccess?.user_id)||null
        const onboarding=onboardings.find(row=>row.establishment_id===establishment.id)||null
        const establishmentTasks=tasks.filter(row=>row.establishment_id===establishment.id)
        return{
          ...establishment,
          invitation:invitations?.find(i=>i.establishment_id===establishment.id)||null,
          owner:owner?{user_id:owner.user_id,email:owner.email,display_name:owner.display_name,status:owner.status,must_change_password:owner.must_change_password}:null,
          access:ownerAccess||null,
          onboarding,
          operations:{total:establishmentTasks.length,completed:establishmentTasks.filter(row=>row.status==='completed').length,blocked:establishmentTasks.filter(row=>row.status==='blocked').length},
        }
      })
      return json({success:true,generated_at:new Date().toISOString(),summary:{establishments:rows.length,active_clients:rows.filter(row=>row.owner?.status==='active'&&row.access?.is_active).length,suspended_clients:rows.filter(row=>row.owner?.status==='suspended'||row.access?.is_active===false).length,tasks_today:tasks.length,tasks_completed:tasks.filter(row=>row.status==='completed').length},establishments:rows})
    }

    if(action==='open_safe_admin'){
      const establishmentId=cleanText(body?.establishment_id,60)
      if(!establishmentId)return json({success:false,error:'establishment_required'},400)
      if(!user.email)return json({success:false,error:'admin_email_missing'},400)
      const{data:establishment,error:estError}=await admin.from('cpg_establishments').select('id,name,haccp_enabled').eq('id',establishmentId).maybeSingle()
      if(estError)throw estError
      if(!establishment)return json({success:false,error:'establishment_not_found'},404)
      if(establishment.haccp_enabled===false)return json({success:false,error:'safe_disabled'},403)
      const redirect=new URL('https://cook-pilot-haccp.vercel.app/')
      redirect.searchParams.set('cp_admin','1')
      redirect.searchParams.set('cp_establishment',establishmentId)
      redirect.searchParams.set('cp_page','config')
      const{data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:user.email,options:{redirectTo:redirect.toString()}})
      if(linkError||!link?.properties?.action_link)throw linkError||new Error('admin_safe_link_failed')
      return json({success:true,establishment_id:establishmentId,establishment:establishment.name,action_link:link.properties.action_link})
    }

    if(action==='provision_client'){
      const tradeName=cleanText(body?.trade_name||body?.legal_name,120)
      const legalName=cleanText(body?.legal_name||tradeName,160)
      const ownerName=cleanText(body?.owner_name,120)
      const ownerEmail=cleanText(body?.owner_email,180).toLowerCase()
      const siret=cleanText(body?.siret,20)||null
      const address=cleanText(body?.address,200)||null
      const city=cleanText(body?.city,100)||null
      const postalCode=cleanText(body?.postal_code,12)||null
      const phone=cleanText(body?.phone,30)||null
      const safeEnabled=body?.safe_enabled!==false
      const humanEnabled=body?.human_enabled!==false
      if(!tradeName||!legalName||!ownerName||!validEmail(ownerEmail))return json({success:false,error:'invalid_client_data'},400)

      const centerEnabled=body?.center_enabled!==false
      if(!centerEnabled&&!safeEnabled&&!humanEnabled)return json({success:false,error:'select_at_least_one_module'},400)
      const {data:existing}=await admin.from('cp_client_invitations').select('establishment_id').eq('email',ownerEmail).maybeSingle()
      const establishmentId=existing?.establishment_id||crypto.randomUUID()
      if(!existing){
       const {error:prepareError}=await admin.rpc('cp_prepare_client',{p_id:establishmentId,p_name:tradeName,p_legal:legalName,p_email:ownerEmail,p_owner:ownerName,p_center:centerEnabled,p_safe:safeEnabled,p_human:humanEnabled,p_address:address,p_city:city,p_postal:postalCode,p_phone:phone,p_siret:siret})
       if(prepareError)throw prepareError
      }
      let delivery='failed'
      try{const result=await sendClientInvitation(admin,ownerEmail);delivery=result.delivery}catch(e){console.error('Client delivery failed',e instanceof Error?e.message:'failed')}
      return json({success:true,client:{establishment_id:establishmentId,establishment:tradeName,owner_name:ownerName,email:ownerEmail,delivery_status:delivery,modules:{center:centerEnabled,safe:safeEnabled,human:humanEnabled}}})
    }

    if(action==='send_invitation'){
      const id=cleanText(body.establishment_id,60)
      const {data:invite}=await admin.from('cp_client_invitations').select('email').eq('establishment_id',id).single()
      if(!invite)return json({success:false,error:'invitation_not_found'},404)
      return json(await sendClientInvitation(admin,invite.email))
    }

    if(action==='set_modules'){
      const establishmentId=cleanText(body?.establishment_id,60)
      if(!['center_enabled','safe_enabled','human_enabled'].every(k=>typeof body[k]==='boolean'))return json({success:false,error:'invalid_modules'},400)
      const {error}=await admin.rpc('cp_set_client_modules',{p_establishment_id:establishmentId,p_center:body.center_enabled,p_safe:body.safe_enabled,p_human:body.human_enabled})
      if(error)throw error
      return json({success:true,modules:{center:body.center_enabled,safe:body.safe_enabled,human:body.human_enabled}})
    }

    if(action==='set_client_status'){
      const userId=cleanText(body?.user_id,60)
      const establishmentId=cleanText(body?.establishment_id,60)
      const status=String(body?.status||'')
      if(!userId||!establishmentId||!['active','suspended'].includes(status))return json({success:false,error:'invalid_status_request'},400)
      const active=status==='active'
      const{error:accountError}=await admin.from('cp_saas_accounts').update({status,updated_at:new Date().toISOString()}).eq('user_id',userId)
      if(accountError)throw accountError
      const{error:accessError}=await admin.from('cp_saas_access').update({is_active:active,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('establishment_id',establishmentId)
      if(accessError)throw accessError
      await admin.from('center_establishments').update({is_active:active}).eq('id',establishmentId)
      return json({success:true,status})
    }

    if(action==='reset_owner_access'){
      const userId=cleanText(body?.user_id,60)
      const establishmentId=cleanText(body?.establishment_id,60)
      if(!userId||!establishmentId)return json({success:false,error:'owner_required'},400)
      const password=randomPassword()
      let safePin=randomPin(),humanPin=randomPin()
      if(humanPin===safePin)humanPin=String((Number(humanPin)+211)%10000).padStart(4,'0')
      const{data:account}=await admin.from('cp_saas_accounts').select('email,display_name').eq('user_id',userId).maybeSingle()
      if(!account?.email)return json({success:false,error:'owner_not_found'},404)
      const{error:authError}=await admin.auth.admin.updateUserById(userId,{password,user_metadata:{display_name:account.display_name,must_change_password:true}})
      if(authError)throw authError
      const{error:pinError}=await admin.rpc('cp_admin_reset_owner_pins',{p_user_id:userId,p_establishment_id:establishmentId,p_safe_pin:safePin,p_human_pin:humanPin})
      if(pinError)throw pinError
      return json({success:true,credentials:{email:account.email,temporary_password:password,safe_pin:safePin,human_pin:humanPin,must_change_password:true,must_change_pins:true}})
    }

    return json({success:false,error:'unknown_action'},400)
  }catch(error){return json({success:false,error:error instanceof Error?error.message:'admin_failed'},500)}
})

