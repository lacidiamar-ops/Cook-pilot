// Only preauthorised client addresses can request onboarding; never accept identity from the browser.
export async function sendClientInvitation(admin:any,email:string,requestedApp='center') {
 const cutoff=new Date(Date.now()-5*60_000).toISOString()
 const {data:invite,error}=await admin.from('cp_client_invitations').update({last_requested_at:new Date().toISOString(),delivery_status:'processing'})
  .eq('email',email).eq('enabled',true).or(`last_requested_at.is.null,last_requested_at.lt.${cutoff}`).select('*').maybeSingle()
 if(error)throw error
 if(!invite)return {success:true,delivery:'unchanged'}
 try {
  const {data:est,error:estError}=await admin.from('cpg_establishments').select('gestion_enabled,haccp_enabled,human_enabled').eq('id',invite.establishment_id).single()
  if(estError)throw estError
  const modules={center:est.gestion_enabled,safe:est.haccp_enabled,human:est.human_enabled}
  const app=modules[requestedApp as keyof typeof modules]?requestedApp:Object.keys(modules).find(k=>modules[k as keyof typeof modules])
  if(!app)throw new Error('no_active_module')
  const urls:Record<string,string>={center:'https://cook-pilot-gestion.vercel.app/?cp_recovery=1',safe:'https://cook-pilot-haccp.vercel.app/?type=recovery',human:'https://cook-pilot-human.vercel.app/saas.html?type=recovery'}
  let userId=invite.user_id
  // Recover a previous partial delivery by the uniquely indexed account email; never overwrite identity.
  if(!userId){const {data:account}=await admin.from('cp_saas_accounts').select('user_id,status').eq('email',email).maybeSingle();if(account?.status==='suspended'||account?.status==='disabled')throw new Error('account_inactive');userId=account?.user_id}
  let delivery='accepted_by_auth'
  if(!userId){
   const {data,error:sendError}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:urls[app],data:{display_name:invite.display_name}})
   if(sendError||!data.user)throw new Error('invitation_mail_failed')
   userId=data.user.id
   const saved=await admin.from('cp_client_invitations').update({user_id:userId,delivery_status:'mail_sent_binding_pending'}).eq('establishment_id',invite.establishment_id)
   if(saved.error)throw saved.error
  }else{
   const {data,error:identityError}=await admin.auth.admin.getUserById(userId)
   if(identityError||data.user?.email?.toLowerCase()!==email)throw new Error('identity_mismatch')
   const {data:account}=await admin.from('cp_saas_accounts').select('status').eq('user_id',userId).maybeSingle()
   if(account&&account.status!=='active'&&account.status!=='invited')throw new Error('account_inactive')
   const {error:sendError}=await admin.auth.resetPasswordForEmail(email,{redirectTo:urls[app]})
   if(sendError)throw new Error('invitation_mail_failed')
  }
  const {data:access,error:accessError}=await admin.from('cp_saas_access').select('user_id').eq('user_id',userId).eq('establishment_id',invite.establishment_id).maybeSingle()
  if(accessError)throw accessError
  if(!access){
   const pin=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0')
   const {error:bindError}=await admin.rpc('cp_bind_client_owner',{p_user_id:userId,p_email:email,p_display_name:invite.display_name,p_establishment_id:invite.establishment_id,p_safe_pin:pin(),p_human_pin:pin()})
   if(bindError)throw bindError
  }
  const {error:saveError}=await admin.from('cp_client_invitations').update({user_id:userId,delivery_status:delivery}).eq('establishment_id',invite.establishment_id)
  if(saveError)throw saveError
  return {success:true,delivery}
 }catch(error){await admin.from('cp_client_invitations').update({delivery_status:'failed'}).eq('establishment_id',invite.establishment_id);throw error}
}
