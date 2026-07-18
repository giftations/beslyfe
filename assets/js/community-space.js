(function () {
  'use strict'
  var endpoint = '/.netlify/functions/community-network'
  var storageKey = 'beslyfe_age_cannadispo'
  var ageGate = document.getElementById('ageGate')
  var content = document.getElementById('spaceContent')

  function esc(value) { return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }
  function initials(name) { return String(name || 'Member').trim().split(/\s+/).slice(0,2).map(function(x){return x.charAt(0)}).join('').toUpperCase() }
  function safeUrl(value) { try { var url=new URL(value,location.origin); return url.protocol==='https:' || url.origin===location.origin ? url.href : '' } catch(e){ return '' } }
  function avatar(item){var src=safeUrl(item.headshotUrl);return src?'<img class="space-avatar" src="'+esc(src)+'" alt="" loading="lazy">':'<span class="space-avatar">'+esc(initials(item.displayName))+'</span>'}

  function profileCard(item){
    return '<a class="space-profile" href="/profile?ecosystem=cannadispo&id='+encodeURIComponent(item.id)+'">'+avatar(item)+'<h3>'+esc(item.displayName||'Cannadispo member')+'</h3><p>'+esc(item.company||item.tagline||item.role||'community member')+'</p><small>View Beslyfe profile →</small></a>'
  }

  function postCard(item){
    var media='';var image=safeUrl(item.imageUrl);var video=safeUrl(item.videoUrl)
    if(video)media='<video src="'+esc(video)+'" controls playsinline preload="metadata"></video>';else if(image)media='<img src="'+esc(image)+'" alt="" loading="lazy">'
    return '<article class="space-post"><div class="space-post-head">'+avatar(item.author||{})+'<div><strong>'+esc((item.author||{}).displayName||'Cannadispo member')+'</strong><span>From Cannadispo · 18+</span></div></div>'+(item.body?'<p>'+esc(item.body)+'</p>':'')+media+'<footer><span>'+Number(item.likeCount||0).toLocaleString()+' helpful</span><span>'+Number(item.commentCount||0).toLocaleString()+' replies</span></footer></article>'
  }

  async function read(type){var response=await fetch(endpoint+'?type='+type+'&ecosystem=cannadispo&ageConfirmed=1&limit=40');var data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load Cannadispo.');return data}

  async function load(){
    ageGate.hidden=true;content.hidden=false
    var profiles=document.getElementById('spaceProfiles');var posts=document.getElementById('spacePostsGrid')
    try{
      var results=await Promise.all([read('profiles'),read('feed')])
      var people=results[0].items||[];var feed=results[1].items||[]
      profiles.innerHTML=people.length?people.map(profileCard).join(''):'<p>No public profiles are available yet.</p>'
      posts.innerHTML=feed.length?feed.map(postCard).join(''):'<p>No public contributions are available yet.</p>'
    }catch(error){profiles.innerHTML='<p>'+esc(error.message)+'</p>';posts.innerHTML='<p>The protected space is temporarily unavailable. The rest of Beslyfe is still online.</p>'}
  }

  document.getElementById('confirmAge').addEventListener('click',function(){try{localStorage.setItem(storageKey,'18')}catch(e){}load()})
  document.getElementById('declineAge').addEventListener('click',function(){try{localStorage.setItem(storageKey,'under')}catch(e){}location.href='/community'})
  document.getElementById('resetAge').addEventListener('click',function(){try{localStorage.removeItem(storageKey)}catch(e){}content.hidden=true;ageGate.hidden=false;ageGate.scrollIntoView({behavior:'smooth'})})
  try{if(localStorage.getItem(storageKey)==='18')load()}catch(e){}
})()
