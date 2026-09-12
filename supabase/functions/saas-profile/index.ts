import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2.108.2'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}})}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  try{
    const auth=req.headers.get('Authorization')||''
    const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}})
    const {data:{user},error:userError}=await userClient.auth.getUser()
    if(userError||!user||user.is_anonymous)return json({success:false,error:'unauthorized'},401)
    const {app,establishment_id=null}=await req.json()
    if(!['safe','human'].includes(app))return json({success:false,error:'unknown_app'},400)

    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})

    const {data:platformProfile}=await admin.from('center_profiles').select('is_platform_admin,full_name').eq('id',user.id).maybeSingle()
    const isPlatformAdmin=platformProfile?.is_platform_admin===true

    if(isPlatformAdmin&&establishment_id){
      const {data:establishment}=await admin.from('cpg_establishments').select('id,name,haccp_enabled,human_enabled').eq('id',establishment_id).maybeSingle()
      if(!establishment)return json({success:false,error:'establishment_not_found'},404)
      if(app==='safe'&&establishment.haccp_enabled===false)return json({success:false,error:'module_disabled'},403)
      if(app==='human'&&establishment.human_enabled===false)return json({success:false,error:'module_disabled'},403)
      const displayName=platformProfile?.full_name||user.user_metadata?.display_name||user.email||'Administrateur Cook Pilot'
      const parts=String(displayName).trim().split(/\s+/)
      const initials=parts.slice(0,2).map((p:string)=>p.charAt(0).toUpperCase()).join('')||'CP'
      return json({
        success:true,
        app,
        admin_mode:true,
        access:{establishment_id:establishment.id,role:'manager',center_enabled:true,safe_enabled:true,human_enabled:true,is_active:true},
        profile:{
          id:user.id,uuid:user.id,auth_uid:user.id,full_name:displayName,
          prenom:parts[0]||'Administrateur',nom:parts.slice(1).join(' '),initials,
          poste:'Administrateur Cook Pilot',role:'manager',active:true,
          establishment_id:establishment.id,email:user.email,display_name:displayName,
          platform_admin:true,establishment_name:establishment.name,
        },
      })
    }

    let accessQuery=admin.from('cp_saas_access').select('establishment_id,role,center_enabled,safe_enabled,human_enabled,is_active').eq('user_id',user.id).eq('is_active',true)
    if(establishment_id)accessQuery=accessQuery.eq('establishment_id',establishment_id)
    const {data:accessRows}=await accessQuery.limit(1)
    const access=accessRows?.[0]
    if(!access)return json({success:false,error:'access_denied'},403)
    if((app==='safe'&&!access.safe_enabled)||(app==='human'&&!access.human_enabled))return json({success:false,error:'module_disabled'},403)

    const {data:account}=await admin.from('cp_saas_accounts').select('display_name,email,status').eq('user_id',user.id).maybeSingle()
    if(account?.status!=='active')return json({success:false,error:'account_inactive'},403)

    if(app==='safe'){
      const {data:employee}=await admin.from('haccp_employees').select('id,full_name,prenom,nom,initials,color,poste,role,active,establishment_id,auth_uid').eq('auth_uid',user.id).eq('establishment_id',access.establishment_id).maybeSingle()
      if(!employee?.active)return json({success:false,error:'safe_profile_missing'},404)
      return json({success:true,app,access,profile:{...employee,uuid:employee.id,email:account?.email,display_name:account?.display_name}})
    }

    const {data:employee}=await admin.from('cph_employees').select('id,full_name,initials,color,job_title,role,active,contract_type,weekly_hours,hourly_rate,establishment_id,auth_uid').eq('auth_uid',user.id).eq('establishment_id',access.establishment_id).maybeSingle()
    if(!employee?.active)return json({success:false,error:'human_profile_missing'},404)
    return json({success:true,app,access,profile:{...employee,email:account?.email,display_name:account?.display_name}})
  }catch(e){return json({success:false,error:e instanceof Error?e.message:'profile_failed'},500)}
})

