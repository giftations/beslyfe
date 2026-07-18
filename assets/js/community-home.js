(function () {
  'use strict'
  var ecosystemEndpoint = '/.netlify/functions/ecosystems'
  var networkEndpoint = '/.netlify/functions/community-network'
  var socialEndpoint = '/.netlify/functions/social?type=feed'
  function esc(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }
  function initials(name) { return String(name || 'Member').split(/\s+/).slice(0,2).map(function (x) { return x.charAt(0) }).join('').toUpperCase() }
  function set(id,value){var el=document.getElementById(id);if(el)el.textContent=Number(value||0).toLocaleString()}

  Promise.all([
    fetch(ecosystemEndpoint+'?type=network-stats').then(function(r){return r.json()}),
    fetch(networkEndpoint+'?type=manifest').then(function(r){return r.json()}).catch(function(){return {sources:[]}})
  ]).then(function(results){
    var data=results[0]||{};var sources=results[1].sources||[]
    var remote=sources.reduce(function(total,source){var c=source.counts||{};total.members+=Number(c.members||0);total.contributions+=Number(c.contributions||0);total.reels+=Number(c.reels||0);return total},{members:0,contributions:0,reels:0})
    set('communityMembers',Number(data.members||0)+remote.members);set('communityPosts',Number(data.contributions||0)+remote.contributions);set('communityReels',Number(data.reels||0)+remote.reels);set('communityEcosystems',data.ecosystems)
  }).catch(function(){})

  Promise.all([
    fetch(socialEndpoint).then(function(r){return r.json()}),
    fetch(networkEndpoint+'?type=manifest').then(function(r){return r.json()}).catch(function(){return {sources:[]}})
  ]).then(function(results){
    var data=results[0]||{};var sources=results[1].sources||[]
    var host=document.getElementById('communityPostGrid');if(!host)return
    var items=(data.items||[]).filter(function(item){return item.body}).slice(0,6)
    if(!items.length){var can=sources.filter(function(x){return x.id==='cannadispo'&&x.status==='available'})[0];host.innerHTML='<article class="community-post"><h3>Your story can start here.</h3><p>Share what you are building, what you need, or a win that can help somebody else.</p><a class="text-link" href="/feed">Create the first post -></a></article>'+(can?'<article class="community-post protected-post"><span class="origin-tag">Cannadispo · 18+</span><h3>'+Number((can.counts||{}).members||0).toLocaleString()+' members are already connected.</h3><p>Enter the protected Cannadispo space to meet its members and read public community posts.</p><a class="text-link" href="/community/cannadispo">Confirm age and enter -></a></article>':'');return}
    host.innerHTML=items.map(function(item){var author=item.author||{};var ecosystem=item.ecosystem||{name:'Beslyfe Community'};return '<article class="community-post"><div class="home-post-head"><span class="home-post-avatar">'+esc(initials(author.displayName))+'</span><div><strong>'+esc(author.displayName||'Member')+'</strong><small>'+esc(author.role||'community member')+'</small></div></div><p>'+esc(item.body).slice(0,360)+'</p><span class="origin-tag">From '+esc(ecosystem.name||'Beslyfe Community')+'</span><footer><small>'+(Number(item.likeCount||0)).toLocaleString()+' helpful signals</small><a href="/feed">Join in -></a></footer></article>'}).join('')
  }).catch(function(){})

  fetch(ecosystemEndpoint+'?type=public').then(function(r){return r.json()}).then(function(data){
    var host=document.getElementById('ecosystemCards');if(!host)return
    var items=(data.items||[]).slice(0,6)
    if(!items.length)return
    host.innerHTML=items.map(function(item){var proof=item.id==='proof-bakd-on-the-bay';var href=proof?'/community/cannadispo':'';var card='<article class="'+(proof?'proof':'')+'"><span>'+(proof?'18+ protected space':esc(item.productType||'ecosystem'))+'</span><h3>'+esc(proof?'Cannadispo':item.name)+'</h3><p>'+esc(proof?'The cannabis and hemp community is connected here with age protection and visible origin.':(item.description||'Connected to the shared Beslyfe network.'))+'</p>'+(proof?'<b>Enter the space -></b>':'')+'</article>';return href?'<a class="ecosystem-card-link" href="'+href+'">'+card+'</a>':card}).join('')
  }).catch(function(){})
})()
