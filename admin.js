(()=>{
  const root=document.getElementById('admin-app')
  const SUPABASE_URL='https://vjulagaprzbnquynwjmt.supabase.co'
  const SUPABASE_KEY='sb_publishable_iT2AHtS29Qi63weZslm56g_oHkqbcvK'
  const ADMIN_RECOVERY_URL=new URL('/admin.html?cp_recovery=1',window.location.origin).href
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
  let overview=null
  let query=''

  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))
  const status=(value,active=true)=>`<span class="pill ${active?'ok':'off'}">${esc(value)}</span>`
  const recoveryRequested=()=>new URLSearchParams(window.location.search).get('cp_recovery')==='1'||window.location.hash.includes('type=recovery')
  const loginParams=()=>new URLSearchParams(window.location.search)

  function shell(content,user){
    root.innerHTML=`<div class="admin-shell">
      <aside class="admin-side">
        <a class="admin-brand" href="/command.html"><span class="admin-mark">C<i></i><i></i><i></i></span><div><b>Cook Pilot</b><small>ADMINISTRATION CENTRALE</small></div></a>
        <nav>
          <a class="active" href="/admin.html">Restaurants</a>
          <a href="/command.html">Cook Pilot Command</a>
          <a href="/technical-loop.html">Support technique</a>
        </nav>
        <div class="admin-side-foot">Accès réservé à l'administrateur plateforme</div>
      </aside>
      <main class="admin-main">
        <header class="admin-top"><div><span>Cook Pilot</span><b>Administration clients</b></div><div class="admin-user"><span>${esc(user?.email||'Administrateur')}</span><button id="logout">Déconnexion</button></div></header>
        ${content}
      </main>
    </div>`
    document.getElementById('logout')?.addEventListener('click',async()=>{await client.auth.signOut();renderLogin()})
  }

  function renderLogin(message=''){
    const params=loginParams()
    const presetEmail=params.get('email')||''
    const passwordReset=params.get('password_reset')==='1'
    const displayedMessage=message||(passwordReset?'Mot de passe enregistré. Connecte-toi maintenant à l’administration centrale.':'')
    root.innerHTML=`<main class="admin-login-wrap"><section class="admin-login">
      <div class="admin-mark large">C<i></i><i></i><i></i></div>
      <span class="eyebrow">COOK PILOT · ADMIN</span>
      <h1>Administration centrale</h1>
      <p>Connexion réservée au compte administrateur Cook Pilot. Center reste exclusivement l'application de gestion du client.</p>
      ${displayedMessage?`<div class="alert">${esc(displayedMessage)}</div>`:''}
      <form id="login-form">
        <label>Adresse e-mail<input id="email" type="email" autocomplete="username" value="${esc(presetEmail)}" required></label>
        <label>Mot de passe<input id="password" type="password" autocomplete="current-password" required></label>
        <button type="submit">Se connecter</button>
        <button type="button" id="forgot-password" class="retry" style="width:100%;margin-top:8px">Mot de passe oublié ?</button>
      </form>
      <a href="/command.html">← Retour à Cook Pilot Command</a>
    </section></main>`
    document.getElementById('login-form').addEventListener('submit',async event=>{
      event.preventDefault()
      const button=event.currentTarget.querySelector('button[type="submit"]')
      button.disabled=true;button.textContent='Connexion…'
      const email=document.getElementById('email').value.trim()
      const password=document.getElementById('password').value
      const {error}=await client.auth.signInWithPassword({email,password})
      if(error){renderLogin('Adresse e-mail ou mot de passe incorrect.');return}
      window.history.replaceState({},document.title,'/admin.html')
      await loadOverview()
    })
    document.getElementById('forgot-password')?.addEventListener('click',async()=>{
      const email=document.getElementById('email').value.trim()
      if(!email){renderLogin('Renseigne ton adresse e-mail administrateur puis clique sur « Mot de passe oublié ? ».');return}
      const button=document.getElementById('forgot-password')
      button.disabled=true;button.textContent='Envoi…'
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:ADMIN_RECOVERY_URL})
      if(error){renderLogin(`Impossible d’envoyer le lien : ${error.message}`);return}
      renderLogin('Un nouveau lien sécurisé vient d’être envoyé. Ouvre le dernier e-mail reçu : il affichera directement la création du nouveau mot de passe administrateur.')
    })
  }

  function renderRecovery(message=''){
    root.innerHTML=`<main class="admin-login-wrap"><section class="admin-login">
      <div class="admin-mark large">C<i></i><i></i><i></i></div>
      <span class="eyebrow">COOK PILOT · ADMIN</span>
      <h1>Nouveau mot de passe</h1>
      <p>Choisis un nouveau mot de passe pour ton compte administrateur Cook Pilot.</p>
      ${message?`<div class="alert">${esc(message)}</div>`:''}
      <form id="reset-form">
        <label>Nouveau mot de passe<input id="new-password" type="password" autocomplete="new-password" minlength="12" required></label>
        <label>Confirmer<input id="confirm-password" type="password" autocomplete="new-password" minlength="12" required></label>
        <button type="submit">Enregistrer le nouveau mot de passe</button>
      </form>
    </section></main>`
    document.getElementById('reset-form')?.addEventListener('submit',async event=>{
      event.preventDefault()
      const password=document.getElementById('new-password').value
      const confirm=document.getElementById('confirm-password').value
      if(password.length<12){renderRecovery('Le mot de passe doit contenir au moins 12 caractères.');return}
      if(password!==confirm){renderRecovery('Les deux mots de passe ne correspondent pas.');return}
      const button=event.currentTarget.querySelector('button')
      button.disabled=true;button.textContent='Enregistrement…'
      const {error}=await client.auth.updateUser({password})
      if(error){renderRecovery(`Impossible de modifier le mot de passe : ${error.message}`);return}
      window.history.replaceState({},document.title,'/admin.html')
      await loadOverview()
    })
  }

  async function invoke(action,payload={}){
    const {data,error}=await client.functions.invoke('saas-admin',{body:{action,...payload}})
    if(error||!data?.success)throw new Error(data?.error||error?.message||'Action impossible')
    return data
  }

  async function loadOverview(){
    const {data:{session}}=await client.auth.getSession()
    if(recoveryRequested()){
      if(session){renderRecovery();return}
      window.history.replaceState({},document.title,'/admin.html')
      renderLogin('Ce lien de réinitialisation n’a plus de session active. Clique sur « Mot de passe oublié ? » pour recevoir un nouveau lien.')
      return
    }
    if(!session){renderLogin();return}
    shell(`<section class="admin-content"><div class="loading-line">Chargement des établissements…</div></section>`,session.user)
    try{
      overview=await invoke('overview')
      renderOverview(session.user)
    }catch(error){
      if(error.message==='platform_admin_required'){
        await client.auth.signOut()
        renderLogin('Ce compte n’est pas autorisé à administrer Cook Pilot.')
        return
      }
      shell(`<section class="admin-content"><div class="alert">${esc(error.message)}</div><button class="retry" id="retry">Réessayer</button></section>`,session.user)
      document.getElementById('retry')?.addEventListener('click',loadOverview)
    }
  }

  function renderOverview(user){
    const summary=overview?.summary||{}
    const all=overview?.establishments||[]
    const needle=query.trim().toLowerCase()
    const rows=all.filter(r=>!needle||[r.name,r.city,r.owner?.display_name,r.owner?.email].some(v=>String(v||'').toLowerCase().includes(needle)))
    const cards=rows.map(r=>{
      const centerEnabled=r.access?.center_enabled??r.gestion_enabled
      const safeEnabled=r.access?.safe_enabled??r.haccp_enabled
      const humanEnabled=r.access?.human_enabled??r.human_enabled
      const active=r.owner?.status==='active'&&r.access?.is_active!==false
      return `<article class="client-card">
        <div class="client-head"><div><span>${active?'CLIENT ACTIF':'CLIENT À VÉRIFIER'}</span><h2>${esc(r.name)}</h2><p>${esc(r.city||'Ville non renseignée')} · ${esc(r.owner?.display_name||'Gérant non défini')}</p></div>${status(active?'Actif':'Inactif',active)}</div><p>Invitation : ${esc(({pending:'À envoyer',processing:'En cours',accepted_by_auth:'Acceptée par le service e-mail',failed:'Échec — à renvoyer',mail_sent_binding_pending:'Rattachement à terminer'})[r.invitation?.delivery_status]||'Non préparée')}</p>
        <div class="client-grid"><div><span>Gérant</span><b>${esc(r.owner?.email||r.email||'—')}</b></div><div><span>Safe</span><b>${safeEnabled?'Activé':'Non activé'}</b></div><div><span>Human</span><b>${humanEnabled?'Activé':'Non activé'}</b></div></div>
        <form class="module-form" data-id="${esc(r.id)}">
          ${[['center','Center',centerEnabled],['safe','Safe',safeEnabled],['human','Human',humanEnabled]].map(([key,label,on])=>`<label><img src="/logo-${key}.jpg" alt="" width="42" height="42"><input type="checkbox" name="${key}_enabled" ${on?'checked':''}> ${label}</label>`).join('')}
          <button type="submit">Enregistrer les applications</button><output aria-live="polite"></output>
        </form>
        <div class="client-actions"><button class="send-invitation" data-id="${esc(r.id)}">Envoyer le lien d’activation</button>
          <button class="safe-open" data-id="${esc(r.id)}" ${safeEnabled?'':'disabled'}>Configurer Safe</button>
          <small>${safeEnabled?'Ouvre Safe en mode administrateur sur cet établissement.':'Safe n’est pas activé pour ce client.'}</small>
        </div>
      </article>`
    }).join('')||'<div class="empty">Aucun établissement ne correspond à la recherche.</div>'

    shell(`<section class="admin-content">
      <div class="admin-heading"><div><span class="eyebrow">PORTEFEUILLE CLIENTS</span><h1>Restaurants Cook Pilot</h1><p>Administration plateforme uniquement. Les applications Center, Safe et Human restent propres à chaque client.</p></div><div><button class="retry" id="provider-checks">Tester les API</button> <button class="retry" id="refresh">Actualiser</button></div></div>
      <div class="metrics"><article><span>Établissements</span><b>${summary.establishments||0}</b></article><article><span>Clients actifs</span><b>${summary.active_clients||0}</b></article><article><span>Tâches aujourd’hui</span><b>${summary.tasks_completed||0}/${summary.tasks_today||0}</b></article></div>
      <details class="client-card"><summary>+ Nouveau client</summary><form id="create-client" class="client-create">
       <label>Établissement<input name="trade_name" required maxlength="120"></label><label>Responsable<input name="owner_name" required maxlength="120"></label><label>E-mail du responsable<input name="owner_email" type="email" required maxlength="180"></label>
       <fieldset><legend>Applications souscrites</legend>${['center','safe','human'].map(app=>`<label><img src="/logo-${app}.jpg" alt="" width="48" height="48"><input type="checkbox" name="${app}_enabled" checked> ${app[0].toUpperCase()+app.slice(1)}</label>`).join('')}</fieldset>
       <button type="submit">Créer le client et envoyer l’invitation</button><output aria-live="polite"></output></form></details>
      <div class="search"><input id="search" value="${esc(query)}" placeholder="Rechercher un restaurant, une ville ou un gérant…"></div>
      <div class="client-list">${cards}</div>
    </section>`,user)

    document.getElementById('create-client')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),output=form.querySelector('output');
      const fields=new FormData(form),payload=Object.fromEntries(fields);for(const app of ['center','safe','human'])payload[app+'_enabled']=fields.has(app+'_enabled');
      if(!['center','safe','human'].some(app=>payload[app+'_enabled'])){output.textContent='Choisissez au moins une application.';return}
      button.disabled=true;output.textContent='Création en cours…';
      try{const result=await invoke('provision_client',payload);output.textContent=result.client.delivery_status==='accepted_by_auth'?'Client créé. Invitation transmise au service e-mail.':'Client enregistré. Invitation à renvoyer depuis sa fiche.';form.reset();await loadOverview()}
      catch(error){output.textContent=error.message}finally{button.disabled=false}
    });
    document.querySelectorAll('.module-form').forEach(form=>form.addEventListener('submit',async event=>{
      event.preventDefault();const button=form.querySelector('button'),output=form.querySelector('output'),fields=new FormData(form);const payload={establishment_id:form.dataset.id};
      for(const app of ['center','safe','human'])payload[app+'_enabled']=fields.has(app+'_enabled');
      if(!['center','safe','human'].some(app=>payload[app+'_enabled'])){output.textContent='Choisissez au moins une application.';return}
      button.disabled=true;try{await invoke('set_modules',payload);output.textContent='Applications enregistrées.'}catch(error){output.textContent=error.message}finally{button.disabled=false}
    }));
    document.querySelectorAll('.send-invitation').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;try{const result=await invoke('send_invitation',{establishment_id:button.dataset.id});button.textContent=result.delivery==='accepted_by_auth'?'Invitation transmise au service e-mail':'Envoi déjà demandé. Réessayez dans cinq minutes.'}catch(error){button.textContent='Échec de l’envoi';window.alert(error.message)}finally{button.disabled=false}
    }));
    document.getElementById('provider-checks')?.addEventListener('click',async event=>{const b=event.currentTarget;b.disabled=true;b.textContent='Tests en cours…';try{const r=await invoke('provider_checks');window.alert(JSON.stringify(r.checks,null,2))}catch(e){window.alert(e.message)}finally{b.disabled=false;b.textContent='Tester les API'}})
    document.getElementById('refresh')?.addEventListener('click',loadOverview)
    document.getElementById('search')?.addEventListener('input',event=>{query=event.target.value;renderOverview(user);const input=document.getElementById('search');input?.focus();input?.setSelectionRange(query.length,query.length)})
    document.querySelectorAll('.safe-open').forEach(button=>button.addEventListener('click',()=>openSafe(button)))
  }

  async function openSafe(button){
    const id=button.dataset.id
    const popup=window.open('about:blank','_blank')
    button.disabled=true
    const previous=button.textContent
    button.textContent='Ouverture…'
    try{
      const data=await invoke('open_safe_admin',{establishment_id:id})
      if(!data.action_link)throw new Error('Lien Safe indisponible')
      if(popup)popup.location.href=data.action_link
      else window.location.href=data.action_link
      button.textContent='Safe ouvert'
      setTimeout(()=>{button.disabled=false;button.textContent=previous},1500)
    }catch(error){
      if(popup)popup.close()
      button.disabled=false;button.textContent=previous
      window.alert(`Impossible d’ouvrir Safe : ${error.message}`)
    }
  }

  client.auth.onAuthStateChange((event,session)=>{
    if(event==='PASSWORD_RECOVERY'){renderRecovery();return}
    if(event==='SIGNED_OUT')renderLogin()
    else if(session&&event==='SIGNED_IN'){
      if(recoveryRequested())renderRecovery()
      else setTimeout(loadOverview,0)
    }
  })

  loadOverview()
})()

