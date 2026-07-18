(function () {
  'use strict'
  var ecosystemEndpoint = '/.netlify/functions/ecosystems'
  var socialEndpoint = '/.netlify/functions/social?type=feed'
  function esc(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }
  function initials(name) { return String(name || 'Member').split(/\s+/).slice(0,2).map(function (x) { return x.charAt(0) }).join('').toUpperCase() }
  function set(id,value){var el=document.getElementById(id);if(el)el.textContent=Number(value||0).toLocaleString()}

  fetch(ecosystemEndpoint+'?type=network-stats').then(function(r){return r.json()}).then(function(data){
    set('communityMembers',data.members);set('communityPosts',data.contributions);set('communityReels',data.reels);set('communityEcosystems',data.ecosystems)
  }).catch(function(){})

  fetch(socialEndpoint).then(function(r){return r.json()}).then(function(data){
    var host=document.getElementById('communityPostGrid');if(!host)return
    var items=(data.items||[]).filter(function(item){return item.body}).slice(0,6)
    if(!items.length){host.innerHTML='<article class="community-post"><h3>Your story can start here.</h3><p>Share what you are building, what you need, or a win that can help somebody else.</p><a class="text-link" href="/feed">Create the first post -></a></article>';return}
    host.innerHTML=items.map(function(item){var author=item.author||{};var ecosystem=item.ecosystem||{name:'Beslyfe Community'};return '<article class="community-post"><div class="home-post-head"><span class="home-post-avatar">'+esc(initials(author.displayName))+'</span><div><strong>'+esc(author.displayName||'Member')+'</strong><small>'+esc(author.role||'community member')+'</small></div></div><p>'+esc(item.body).slice(0,360)+'</p><span class="origin-tag">From '+esc(ecosystem.name||'Beslyfe Community')+'</span><footer><small>'+(Number(item.likeCount||0)).toLocaleString()+' helpful signals</small><a href="/feed">Join in -></a></footer></article>'}).join('')
  }).catch(function(){})

  fetch(ecosystemEndpoint+'?type=public').then(function(r){return r.json()}).then(function(data){
    var host=document.getElementById('ecosystemCards');if(!host)return
    var items=(data.items||[]).slice(0,6)
    if(!items.length)return
    host.innerHTML=items.map(function(item){var proof=item.id==='proof-bakd-on-the-bay';return '<article class="'+(proof?'proof':'')+'"><span>'+esc(item.productType||'ecosystem')+'</span><h3>'+esc(item.name)+'</h3><p>'+esc(item.description||'Connected to the shared Beslyfe network.')+'</p></article>'}).join('')
  }).catch(function(){})
})()
