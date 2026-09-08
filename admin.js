(()=>{
  const root=document.getElementById('admin-app')
  const SUPABASE_URL='https://vjulagaprzbnquynwjmt.supabase.co'
  const SUPABASE_KEY='sb_publishable_iT2AHtS29Qi63weZslm56g_oHkqbcvK'
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
  let overview=null
  let query=''

  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))
  const status=(value,active=true)=>`<span class="pill ${active?'ok':'off'}">${esc(value)}</span>`

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
    root.innerHTML=`<main class="admin-login-wrap"><section class="admin-login">
      <div class="admin-mark large">C<i></i><i></i><i></i></div>
      <span class="eyebrow">COOK PILOT · ADMIN</span>
      <h1>Administration centrale</h1>
      <p>Connexion réservée au compte administrateur Cook Pilot. Center reste exclusivement l'application de gestion du client.</p>
      ${message?`<div class="alert">${esc(message)}</div>`:''}
      <form id="login-form">
        <label>Adresse e-mail<input id="email" type="email" autocomplete="username" required></label>
        <label>Mot de passe<input id="password" type="password" autocomplete="current-password" required></label>
        <button type="submit">Se connecter</button>
      </form>
      <a href="/command.html">← Retour à Cook Pilot Command</a>
    </section></main>`
    document.getElementById('login-form').addEventListener('submit',async event=>{
      event.preventDefault()
      const button=event.currentTarget.querySelector('button')
      button.disabled=true;button.textContent='Connexion…'
      const email=document.getElementById('email').value.trim()
      const password=document.getElementById('password').value
      const {error}=await client.auth.signInWithPassword({email,password})
      if(error){renderLogin(error.message);return}
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
      const safeEnabled=r.access?.safe_enabled??r.haccp_enabled
      const humanEnabled=r.access?.human_enabled??r.human_enabled
      const active=r.owner?.status==='active'&&r.access?.is_active!==false
      return `<article class="client-card">
        <div class="client-head"><div><span>${active?'CLIENT ACTIF':'CLIENT À VÉRIFIER'}</span><h2>${esc(r.name)}</h2><p>${esc(r.city||'Ville non renseignée')} · ${esc(r.owner?.display_name||'Gérant non défini')}</p></div>${status(active?'Actif':'Inactif',active)}</div>
        <div class="client-grid"><div><span>Gérant</span><b>${esc(r.owner?.email||r.email||'—')}</b></div><div><span>Safe</span><b>${safeEnabled?'Activé':'Non activé'}</b></div><div><span>Human</span><b>${humanEnabled?'Activé':'Non activé'}</b></div></div>
        <div class="client-actions">
          <button class="safe-open" data-id="${esc(r.id)}" ${safeEnabled?'':'disabled'}>Configurer Safe</button>
          <small>${safeEnabled?'Ouvre Safe en mode administrateur sur cet établissement.':'Safe n’est pas activé pour ce client.'}</small>
        </div>
      </article>`
    }).join('')||'<div class="empty">Aucun établissement ne correspond à la recherche.</div>'

    shell(`<section class="admin-content">
      <div class="admin-heading"><div><span class="eyebrow">PORTEFEUILLE CLIENTS</span><h1>Restaurants Cook Pilot</h1><p>Administration plateforme uniquement. Les applications Center, Safe et Human restent propres à chaque client.</p></div><button class="retry" id="refresh">Actualiser</button></div>
      <div class="metrics"><article><span>Établissements</span><b>${summary.establishments||0}</b></article><article><span>Clients actifs</span><b>${summary.active_clients||0}</b></article><article><span>Tâches aujourd’hui</span><b>${summary.tasks_completed||0}/${summary.tasks_today||0}</b></article></div>
      <div class="search"><input id="search" value="${esc(query)}" placeholder="Rechercher un restaurant, une ville ou un gérant…"></div>
      <div class="client-list">${cards}</div>
    </section>`,user)

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
    if(event==='SIGNED_OUT')renderLogin()
    else if(session&&event==='SIGNED_IN')loadOverview()
  })

  loadOverview()
})()
