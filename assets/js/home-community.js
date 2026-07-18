(function () {
  'use strict'
  var statsEndpoint = '/.netlify/functions/ecosystems?type=network-stats'
  var networkEndpoint = '/.netlify/functions/community-network?type=manifest'
  var socialEndpoint = '/.netlify/functions/social?type=feed'

  function text(id, value) {
    var el = document.getElementById(id)
    if (el) el.textContent = Number(value || 0).toLocaleString()
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function initials(name) {
    return String(name || 'Member').split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0) }).join('').toUpperCase()
  }

  Promise.all([
    fetch(statsEndpoint).then(function (res) { return res.json() }),
    fetch(networkEndpoint).then(function (res) { return res.json() }).catch(function(){return {sources:[]}})
  ]).then(function (results) {
    var data=results[0]||{};var sources=results[1].sources||[]
    var remote=sources.reduce(function(total,source){var c=source.counts||{};total.members+=Number(c.members||0);total.contributions+=Number(c.contributions||0);return total},{members:0,contributions:0})
    var members=Number(data.members||0)+remote.members;var contributions=Number(data.contributions||0)+remote.contributions
    text('statMembers', members)
    text('statContributions', contributions)
    text('statEcosystems', data.ecosystems)
    text('statWins', data.successStories)
    var memberCount = document.getElementById('networkMemberCount')
    if (memberCount) memberCount.textContent = members.toLocaleString() + ' members'
  }).catch(function () {})

  Promise.all([
    fetch(socialEndpoint).then(function (res) { return res.json() }),
    fetch(networkEndpoint).then(function (res) { return res.json() }).catch(function(){return {sources:[]}})
  ]).then(function (results) {
    var data=results[0]||{};var sources=results[1].sources||[]
    var host = document.getElementById('homeFeed')
    if (!host) return
    var items = (data.items || []).filter(function (item) { return item.body }).slice(0, 3)
    if (!items.length) {
      var can=sources.filter(function(source){return source.id==='cannadispo'&&source.status==='available'})[0]
      host.innerHTML = '<article class="home-post"><div class="home-post-head"><span class="home-post-avatar">B</span><div><strong>Start the general feed</strong><small>Beslyfe Community</small></div></div><p>Ask for help, share what you are building, or tell the community about a win.</p><a class="text-link" href="/feed">Start a conversation -></a></article>'+(can?'<article class="home-post"><div class="home-post-head"><span class="home-post-avatar">18</span><div><strong>Cannadispo is connected</strong><small>Age-protected Beslyfe space</small></div></div><p>'+Number((can.counts||{}).members||0).toLocaleString()+' members and '+Number((can.counts||{}).contributions||0).toLocaleString()+' public contributions are available after age confirmation.</p><a class="text-link" href="/community/cannadispo">Enter the 18+ space -></a></article>':'')
      return
    }
    host.innerHTML = items.map(function (item) {
      var author = item.author || {}
      var ecosystem = item.ecosystem || { name: 'Beslyfe Community' }
      return '<article class="home-post"><div class="home-post-head"><span class="home-post-avatar">' + esc(initials(author.displayName)) + '</span><div><strong>' + esc(author.displayName || 'Member') + '</strong><small>' + esc(author.role || 'community member') + '</small></div></div><p>' + esc(item.body).slice(0, 260) + '</p><span class="origin-tag">From ' + esc(ecosystem.name || 'Beslyfe Community') + '</span></article>'
    }).join('')
  }).catch(function () {
    var host = document.getElementById('homeFeed')
    if (host) host.innerHTML = '<article class="home-post"><p>The community feed is available inside Beslyfe.</p><a class="text-link" href="/feed">Open the feed -></a></article>'
  })
})()
