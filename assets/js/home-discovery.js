(function () {
  'use strict'

  var endpoint='/.netlify/functions/ecosystems'
  var entry=document.getElementById('entryDiscovery')
  var loading=document.getElementById('entryLoading')
  var question=document.getElementById('entryQuestion')
  var resume=document.getElementById('entryResume')
  var experience=document.getElementById('homeExperience')
  var storageKey='beslyfe_entry_start_v1'
  var draftKey='beslyfe_build_draft'
  var paths={
    known:{eyebrow:'Your idea has a place to grow.',title:'You have the idea.<br><em>Let\'s make it real.</em>',lead:'Beslyfe will help you test the idea, shape the smallest useful version, connect it to people, and automate only what proves worth repeating.',action:'Shape my idea'},
    ideas:{eyebrow:'You do not have to bet everything.',title:'Compare the ideas.<br><em>Start with evidence.</em>',lead:'Beslyfe will compare cost, time, reachable people, and the fastest honest test so you can choose without guessing or overcommitting.',action:'Compare my ideas'},
    unsure:{eyebrow:'Not knowing is a real starting point.',title:'You do not need the answer.<br><em>We will find a path.</em>',lead:'Beslyfe will ask about your strengths, real-life experience, time, resources, and limits—then recommend one small experiment instead of inventing a dream for you.',action:'Help me find a path'},
    income:{eyebrow:'Urgency deserves an honest plan.',title:'Start with a safer path<br><em>toward income.</em>',lead:'Beslyfe separates a legitimate near-term action from a longer-term build. No guaranteed earnings, risky shortcuts, predatory debt, or pretending pressure does not exist.',action:'Build my income path'},
    explore:{eyebrow:'One community. Infinite useful things.',title:'Build it.<br><em>Grow it together.</em>',lead:'Create a blog, creative career hub, online business, operating system, event, community, or something nobody has named yet. Beslyfe helps assemble it, grow it, and automate the repetitive work.',action:'Answer the first question'}
  }

  function localDraft(){try{return JSON.parse(localStorage.getItem(draftKey)||'null')}catch(_){return null}}
  function setStoredPath(value){try{localStorage.setItem(storageKey,value)}catch(_){}}
  function storedPath(){try{return localStorage.getItem(storageKey)||''}catch(_){return ''}}
  function showQuestion(){loading.hidden=true;resume.hidden=true;experience.hidden=true;entry.hidden=false;question.hidden=false;document.title='Start with you - Beslyfe'}
  function showResume(){loading.hidden=true;question.hidden=true;experience.hidden=true;entry.hidden=false;resume.hidden=false;document.title='Resume your Beslyfe plan'}
  function showHome(key){var path=paths[key]||paths.explore;setStoredPath(key);loading.hidden=true;question.hidden=true;resume.hidden=true;entry.hidden=true;experience.hidden=false;document.getElementById('homePathEyebrow').innerHTML='<span class="pulse"></span> '+path.eyebrow;document.getElementById('homePathTitle').innerHTML=path.title;document.getElementById('homePathLead').textContent=path.lead;var action=document.getElementById('homePathAction');action.textContent=path.action;action.href='/create'+(key&&key!=='explore'?'?starting='+encodeURIComponent(key):'');document.title='Beslyfe - Build, grow, and belong';document.getElementById('homePathTitle').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'})}

  document.querySelectorAll('[data-entry-answer]').forEach(function(button){button.addEventListener('click',function(){showHome(button.getAttribute('data-entry-answer'))})})
  document.getElementById('entryExplore').addEventListener('click',function(){showHome('explore')})
  document.getElementById('entryResumeExplore').addEventListener('click',function(){showHome(storedPath()||'explore')})
  document.getElementById('changeEntryAnswer').addEventListener('click',function(){showQuestion();window.scrollTo({top:0,behavior:'smooth'})})

  async function boot(){
    var force=new URLSearchParams(location.search).get('questions')==='1'
    if(force){showQuestion();return}
    var account=null
    try{var sessionResponse=await fetch('/.netlify/functions/auth?action=session',{headers:{Accept:'application/json'}});if(sessionResponse.ok){var session=await sessionResponse.json();account=session&&session.account?session.account:null}}catch(_){}
    if(account){
      try{
        var results=await Promise.all([fetch(endpoint,{headers:{Accept:'application/json'}}),fetch(endpoint+'?type=draft',{headers:{Accept:'application/json'}})])
        var projects=results[0].ok?await results[0].json():{items:[]}
        var draft=results[1].ok?await results[1].json():{item:null}
        var hasProject=(projects.items||[]).some(function(item){return item.id!=='beslyfe-network'})
        if(hasProject){showHome(storedPath()||'explore');return}
        if(draft.item||localDraft()){showResume();return}
      }catch(_){}
      showQuestion();return
    }
    if(localDraft()){showResume();return}
    showQuestion()
  }

  boot()
})()
