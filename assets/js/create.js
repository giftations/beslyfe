(function () {
  'use strict'

  var endpoint = '/.netlify/functions/ecosystems'
  var maxSteps = 7
  var state = {
    step: 1,
    startingPoint: '',
    productType: '',
    productChosenManually: false,
    recommendedProduct: '',
    recommendedOutcomes: [],
    outcomes: [],
    capabilities: [],
    guidanceSummary: '',
    account: null,
    contracts: null,
    paymentInputs: {},
  }

  var labels = { identity:'Identity',cms:'Website & content',analytics:'Analytics','community-bridge':'Community bridge',commerce:'Online sales',crm:'Customer relationships',directory:'People directory',community:'Feed, reels & stories',messaging:'Messages & groups',scheduling:'Bookings & schedule',applications:'Applications',advertising:'Advertising',operations:'Operations workspace',inventory:'Products & inventory',property:'Property management',automation:'Workflow automation',ai:'AI assistance',ticketing:'Ticketing',floorplan:'Floor plan' }
  var descriptions = { identity:'A network identity with explicit linking between separately hosted accounts.',cms:'Publish pages, offers, proof, and useful content.',analytics:'Measure traffic, sources, campaigns, and outcomes.','community-bridge':'New members strengthen the shared Beslyfe network.',commerce:'Connect checkout, booking, donation, or lead actions.',crm:'Track leads, customers, follow-ups, and value.',directory:'Make useful people and organizations discoverable.',community:'Share posts, reels, stories, progress, and success.',messaging:'Turn discovery into private conversations and groups.',scheduling:'Offer appointments, sessions, or a public schedule.',applications:'Use a review process for gated participation.',advertising:'Publish clearly labeled campaigns and sponsorships.',operations:'Organize recurring work, owners, status, handoffs, and daily reporting.',inventory:'Track products, suppliers, stock needs, and merchandising workflows.',property:'Coordinate properties, owners, tenants, maintenance, inspections, and rent actions.',automation:'Run reviewable, pausable internal, external, or hybrid workflows.',ai:'Assist with research, drafting, and next actions under user controls.',ticketing:'Connect ticket access only when you explicitly need it.',floorplan:'Map booths, rooms, a store, or another physical space.' }
  var fallbackProducts = [
    {key:'business',label:'Business',promise:'Sell, book, and grow customer relationships.'},{key:'website',label:'Website',promise:'Publish a focused site with only the tools you need.'},{key:'publisher',label:'Blog, publication, or newsletter',promise:'Publish consistently and grow an audience.'},{key:'creator',label:'Model, creator, or portfolio',promise:'Show work, book opportunities, and sell directly.'},{key:'retail',label:'Retail store',promise:'Connect products, people, promotions, and daily operations.'},{key:'property',label:'Property management',promise:'Coordinate properties, tenants, maintenance, and reporting.'},{key:'community',label:'Community',promise:'Connect members through content and conversation.'},{key:'event',label:'Event',promise:'Build community before, during, and after an event.'},{key:'nonprofit',label:'Nonprofit or cause',promise:'Organize supporters, donations, and impact.'},{key:'custom',label:'Something else',promise:'Describe the dream and Beslyfe will shape a custom system.'}
  ]
  var fallbackOutcomes = [
    {key:'online-sales',label:'Generate online sales',capabilities:['commerce','analytics','crm']},{key:'qualified-leads',label:'Collect qualified leads',capabilities:['crm','cms','analytics']},{key:'bookings',label:'Book appointments or services',capabilities:['scheduling','commerce','crm']},{key:'community-growth',label:'Grow a community',capabilities:['community','messaging','directory']},{key:'publish-content',label:'Publish useful content',capabilities:['cms','community']},{key:'grow-audience',label:'Grow an audience',capabilities:['cms','community','analytics','advertising']},{key:'book-opportunities',label:'Book paid opportunities',capabilities:['scheduling','crm','commerce','directory']},{key:'run-operations',label:'Organize daily operations',capabilities:['operations','automation','crm','analytics']},{key:'manage-inventory',label:'Manage products and inventory',capabilities:['inventory','operations','commerce','analytics']},{key:'manage-properties',label:'Manage properties and tenants',capabilities:['property','operations','crm','scheduling','applications']},{key:'automate-workflows',label:'Automate repetitive work',capabilities:['automation','ai','analytics']},{key:'ticket-sales',label:'Sell event tickets',capabilities:['ticketing','commerce']},{key:'donations',label:'Accept donations',capabilities:['commerce','crm']}
  ]
  var baseByProduct = { business:['identity','cms','analytics','community-bridge','commerce','crm','directory','community'],website:['identity','cms','analytics','community-bridge'],publisher:['identity','cms','analytics','community-bridge','community','directory'],creator:['identity','cms','analytics','community-bridge','community','directory','crm'],retail:['identity','cms','analytics','community-bridge','commerce','crm','directory','operations','inventory','automation'],property:['identity','cms','analytics','community-bridge','crm','directory','scheduling','applications','operations','property','automation'],community:['identity','cms','analytics','community-bridge','community','messaging','directory'],event:['identity','cms','analytics','community-bridge','community','directory','scheduling'],nonprofit:['identity','cms','analytics','community-bridge','community','directory','crm'],custom:['identity','cms','analytics','community-bridge','operations','automation'] }

  var experimentPlans = {
    service: { label:'One useful service for a reachable person', product:'business', outcomes:['qualified-leads','bookings'], immediate:'Choose one problem you can help with, talk to three to five reachable people, and make one small, clear offer before buying tools or ads.', durable:'Turn the offer that gets a real response into a simple page, lead form, booking path, follow-up system, and proof of work.', audience:'People I can reach who have one specific problem I understand.', offer:'One small, clearly priced service that produces a useful result without a large upfront investment.' },
    product: { label:'One product tested before a full store', product:'retail', outcomes:['online-sales','manage-inventory'], immediate:'Show one product or sample to real potential buyers, ask what they would pay, and seek a small proof of demand before building inventory.', durable:'Build the storefront, checkout, inventory, customer follow-up, and repeat-sales system around what people actually choose.', audience:'People who already buy or look for the kind of product I can provide.', offer:'One focused product test with a clear benefit, honest price, and simple way to respond.' },
    creator: { label:'A proof-of-work page and paid opportunity path', product:'creator', outcomes:['publish-content','book-opportunities'], immediate:'Create one strong sample, show it to a small relevant audience, and ask for a specific booking, collaboration, or paid opportunity.', durable:'Build a portfolio, media kit, inquiry workflow, content rhythm, and follow-up system around the work that earns real interest.', audience:'Clients, brands, collaborators, and supporters looking for the kind of work I can create.', offer:'A clear sample of my work and one easy way to request a paid project or collaboration.' },
    operations: { label:'A practical improvement for a local operation', product:'business', outcomes:['qualified-leads','run-operations','automate-workflows'], immediate:'Identify one repeated task or costly mess inside a business you understand, describe a small improvement, and test it with one owner or operator.', durable:'Turn the proven improvement into an operating workspace, reporting rhythm, customer system, and reviewable automation.', audience:'A local owner or small team dealing with a repeated operational problem.', offer:'A small, measurable improvement to one time-consuming or disorganized part of the operation.' },
    community: { label:'A small community around one shared need', product:'community', outcomes:['community-growth','publish-content'], immediate:'Invite a handful of people who share one real need, ask what would help them, and host one useful conversation or resource exchange.', durable:'Build the member profiles, feed, groups, messaging, resources, and success stories around the participation that proves useful.', audience:'People who share one problem, goal, place, identity, or interest and want to help one another.', offer:'A welcoming place to exchange useful help, document progress, and create opportunities together.' },
    opportunities: { label:'A profile built to win one kind of paid opportunity', product:'creator', outcomes:['book-opportunities','qualified-leads'], immediate:'Choose one kind of paid opportunity, prepare one proof item, and contact a few legitimate people or organizations that already hire for it.', durable:'Build a credible profile, inquiry path, availability, follow-up, and reputation system around the opportunities that respond.', audience:'Legitimate people and organizations that hire, book, or contract for work I can learn or already do.', offer:'A truthful profile, one proof item, and a simple way to ask about a specific paid opportunity.' },
    unsure: { label:'A seven-day discovery sprint', product:'custom', outcomes:['community-growth'], immediate:'Ask five people what they trust you to help with, notice repeated problems around you, and share one small no-debt experiment with the Beslyfe community.', durable:'Use the answers and community feedback to choose one problem, then build only the smallest page, workflow, or offer needed to test it.', audience:'People in my existing world who can help reveal a real problem worth solving.', offer:'A small interview, helpful action, or prototype designed to discover demand before I make a large commitment.' },
  }

  var form = document.getElementById('buildForm')
  var next = document.getElementById('nextButton')
  var back = document.getElementById('backButton')
  var builder = document.getElementById('builder')
  var accountGate = document.getElementById('accountGate')
  var accountGateStatus = document.getElementById('accountGateStatus')
  var builderSaveState = document.getElementById('builderSaveState')
  var localDraftKey = 'beslyfe_build_draft'
  var saveTimer = null

  function showAccountCheckpoint(message) { builder.hidden=true;builder.setAttribute('aria-hidden','true');accountGate.hidden=false;if(message)accountGateStatus.textContent=message;accountGate.scrollIntoView({behavior:'smooth',block:'start'}) }
  function unlockBuilder(account) { state.account=account||null;accountGate.hidden=true;builder.hidden=false;builder.setAttribute('aria-hidden','false');var skip=document.querySelector('.skip');if(skip){skip.setAttribute('href','#builder');skip.textContent='Skip to questions'}if(state.account){builderSaveState.innerHTML='<strong>Saved to your account.</strong><span>Beslyfe keeps this questionnaire resumable after an interruption or on another device.</span>';document.getElementById('launchHint').textContent='This build will belong to your free Beslyfe account and strengthen the shared community.'}else{builderSaveState.innerHTML='<strong>Questions first.</strong><span>Your early answers save on this device. After discovery, create a free account so the complete plan stays with you.</span>';document.getElementById('launchHint').textContent='A free community account is required only when you are ready to create and save the plan.'} }
  function esc(value) { return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }
  function products() { return state.contracts&&state.contracts.products?state.contracts.products.blueprints:fallbackProducts }
  function outcomes() { return state.contracts&&state.contracts.products?state.contracts.products.outcomes:fallbackOutcomes }
  function checkedValues(name) { return Array.prototype.slice.call(document.querySelectorAll('input[name="'+name+'"]:checked')).map(function(input){return input.value}) }
  function selectedValue(name) { var input=document.querySelector('input[name="'+name+'"]:checked'); return input?input.value:'' }
  function fieldValue(id) { var field=document.getElementById(id); return field?field.value.trim():'' }
  function selectText(id) { var field=document.getElementById(id); return field&&field.selectedIndex>=0?field.options[field.selectedIndex].text:'' }
  function isUnknownAnswer(value) { return !String(value||'').trim()||/^(?:i\s+)?(?:do not|don['’]?t)\s+know(?:\s+yet)?$|^not\s+sure(?:\s+yet)?$|^idk$/i.test(String(value).trim()) }

  function salesModes() { return state.contracts&&state.contracts.sales?state.contracts.sales.modes:[{key:'product',label:'Sell a product',actionLabel:'Buy now'},{key:'service',label:'Sell a service',actionLabel:'Get started'},{key:'booking',label:'Book an appointment',actionLabel:'Book now'},{key:'lead',label:'Collect a lead',actionLabel:'Request details'},{key:'donation',label:'Accept a donation',actionLabel:'Support this work'},{key:'ticket',label:'Sell a ticket',actionLabel:'Get tickets'}] }
  function salesProviders() { return state.contracts&&state.contracts.sales?state.contracts.sales.providers:[{key:'paypal',label:'PayPal.Me',entry:'handle',handleExample:'@YourPayPalName',handlePattern:'^[A-Za-z0-9]{1,20}$',destinationTemplate:'https://paypal.me/{handle}',supports:['product','service','booking','donation','ticket']},{key:'cash-app',label:'Cash App',entry:'handle',handleExample:'@YourCashtag',handlePattern:'^[A-Za-z][A-Za-z0-9]{0,19}$',destinationTemplate:'https://cash.app/${handle}',supports:['product','service','booking','donation','ticket']},{key:'venmo',label:'Venmo',entry:'handle',handleExample:'@YourVenmoName',handlePattern:'^[A-Za-z0-9_-]{5,30}$',destinationTemplate:'https://venmo.com/u/{handle}',supports:['product','service','booking','donation','ticket']},{key:'stripe-payment-link',label:'Stripe Payment Link',supports:['product','service','booking','donation','ticket']},{key:'shopify-buy-button',label:'Shopify Buy Button',supports:['product']},{key:'square-checkout',label:'Square Online Checkout',supports:['product','service','booking','donation','ticket']},{key:'booking-link',label:'Booking provider',supports:['booking','service']},{key:'contact-form',label:'Beslyfe lead form',entry:'built-in',supports:['lead']},{key:'external',label:'Another secure checkout',supports:['product','service','booking','donation','ticket']}] }

  function renderProducts() {
    var host=document.getElementById('productChoices')
    host.innerHTML=products().map(function(item){return '<span class="choice"><input type="radio" name="productType" id="type-'+esc(item.key)+'" value="'+esc(item.key)+'"'+(state.productType===item.key?' checked':'')+'><label for="type-'+esc(item.key)+'"><strong>'+esc(item.label)+'</strong><small>'+esc(item.promise||'Start with this product type.')+'</small></label></span>'}).join('')
  }

  function renderOutcomes() {
    var host=document.getElementById('outcomeChoices')
    host.innerHTML=outcomes().map(function(item){return '<span class="choice"><input type="checkbox" name="outcome" id="goal-'+esc(item.key)+'" value="'+esc(item.key)+'"'+(state.outcomes.indexOf(item.key)>=0?' checked':'')+'><label for="goal-'+esc(item.key)+'"><strong>'+esc(item.label)+'</strong><small>'+esc((item.capabilities||[]).map(function(x){return labels[x]||x}).join(' + '))+'</small></label></span>'}).join('')
  }

  function recommend() {
    var set=new Set(baseByProduct[state.productType]||baseByProduct.website)
    outcomes().forEach(function(item){if(state.outcomes.indexOf(item.key)>=0)(item.capabilities||[]).forEach(function(key){set.add(key)})})
    if(state.outcomes.indexOf('ticket-sales')<0)set.delete('ticketing')
    state.capabilities=Array.from(set)
    renderCapabilities()
  }

  function recommendationText() { var text=state.capabilities.indexOf('ticketing')>=0?'Ticketing is on because you selected it. You can turn it off at any time.':'Ticketing is off. This build can launch without ticket access.'; if(state.capabilities.indexOf('automation')>=0)text+=' Automation is recommended for repetitive work and remains reviewable and pausable.'; return text }
  function renderCapabilities() { var host=document.getElementById('capabilityPicker'); if(!host)return; var order=['identity','cms','analytics','community-bridge','commerce','crm','directory','community','messaging','scheduling','applications','advertising','operations','inventory','property','automation','ai','ticketing','floorplan']; host.innerHTML=order.map(function(key){var checked=state.capabilities.indexOf(key)>=0;var required=['identity','community-bridge'].indexOf(key)>=0;return '<label class="capability-option '+(checked?'':'optional')+'"><input type="checkbox" value="'+key+'"'+(checked?' checked':'')+(required?' disabled':'')+'><span><strong>'+esc(labels[key]||key)+'</strong><small>'+esc(descriptions[key]||'Optional capability.')+'</small></span><span>'+(required?'Shared core':checked?'Recommended':'Optional')+'</span></label>'}).join(''); host.querySelectorAll('input').forEach(function(input){input.addEventListener('change',function(){var set=new Set(state.capabilities);if(input.checked)set.add(input.value);else set.delete(input.value);state.capabilities=Array.from(set);document.getElementById('recommendationNote').textContent=recommendationText()})}); document.getElementById('recommendationNote').textContent=recommendationText() }

  function updateStartingResponse() {
    state.startingPoint=selectedValue('startingPoint')
    var response=document.getElementById('startingResponse')
    var messages={
      known:['Good. We will test the idea before making it bigger.','Beslyfe will ask who it serves, what result it creates, what resources it needs, and which parts should be automated.'],
      ideas:['You do not have to bet everything on one idea.','Beslyfe will compare the ideas against your time, access to customers, cost to test, and the evidence you can get quickly.'],
      unsure:["That is a real answer, not a failure.","Beslyfe will not ask you to invent a passion. We will look for strengths, problems you understand, people you can reach, and a low-risk experiment."],
      income:['Understood. We will treat urgency honestly.','Beslyfe will separate a legitimate near-term income action from the longer-term system. It will not guarantee earnings or send you toward scams, debt, or unsafe shortcuts.'],
    }
    var message=messages[state.startingPoint]||['You do not need a polished idea.','Choose the answer that is most honest today. Beslyfe will keep narrowing the path without pretending income is guaranteed.']
    response.innerHTML='<strong>'+esc(message[0])+'</strong><p>'+esc(message[1])+'</p>'
    syncIncomeDetails()
  }

  function syncIncomeDetails() {
    var timing=fieldValue('incomeTiming')
    document.getElementById('incomeDetails').hidden=!(state.startingPoint==='income'||['urgent','month','quarter'].indexOf(timing)>=0)
    updateDiscoverySupport()
  }

  function updateDiscoverySupport() {
    var host=document.getElementById('discoverySupport')
    var risk=selectedValue('riskMindset')
    var timing=fieldValue('incomeTiming')
    if(risk==='pressured'){
      host.innerHTML='<strong>Pressure deserves a safer pace, not a riskier recommendation.</strong><p>Beslyfe will avoid large commitments and questionable offers. If basic needs or personal safety are in immediate danger, use appropriate local support or emergency services alongside this planning tool.</p>'
    }else if(timing==='urgent'){
      host.innerHTML='<strong>We will start with reachable people and low-cost actions.</strong><p>Beslyfe cannot promise immediate income. It will prioritize legitimate tests that use what you already have, while keeping a separate longer-term plan.</p>'
    }else{
      host.innerHTML='<strong>A good plan starts small.</strong><p>Your first goal is evidence: one useful offer, one real conversation, or one small test - not a promise of instant income.</p>'
    }
  }

  function readDiscovery() {
    return {
      startingPoint:state.startingPoint,
      incomeTiming:fieldValue('incomeTiming'),
      incomeTimingLabel:selectText('incomeTiming'),
      incomeTarget:fieldValue('incomeTarget'),
      currentIncome:fieldValue('currentIncome'),
      weeklyTime:fieldValue('weeklyTime'),
      weeklyTimeLabel:selectText('weeklyTime'),
      strengths:fieldValue('strengths'),
      problemsUnderstood:fieldValue('problemsUnderstood'),
      workPreferences:checkedValues('workPreference'),
      resources:checkedValues('availableResource'),
      startingExperiment:fieldValue('startingExperiment')||'unsure',
      hardLimits:fieldValue('hardLimits'),
      riskMindset:selectedValue('riskMindset'),
      safetyCommitment:document.getElementById('safetyCommitment').checked,
    }
  }

  function deriveExperiment(discovery) {
    if(discovery.startingExperiment&&discovery.startingExperiment!=='unsure')return discovery.startingExperiment
    var preference=discovery.workPreferences
    if(preference.indexOf('service')>=0||preference.indexOf('hands-on')>=0)return 'service'
    if(preference.indexOf('products')>=0)return 'product'
    if(preference.indexOf('creator')>=0)return 'creator'
    if(preference.indexOf('organize')>=0||preference.indexOf('technical')>=0)return 'operations'
    if(preference.indexOf('community')>=0)return 'community'
    if(discovery.startingPoint==='income')return 'service'
    return 'unsure'
  }

  function applyDiscoveryRecommendation() {
    var discovery=readDiscovery()
    var experimentKey=deriveExperiment(discovery)
    var plan=experimentPlans[experimentKey]||experimentPlans.unsure
    var previousRecommended=state.recommendedProduct
    state.recommendedProduct=plan.product
    if(!state.productChosenManually||!state.productType||state.productType===previousRecommended)state.productType=plan.product
    if(!state.outcomes.length||JSON.stringify(state.outcomes)===JSON.stringify(state.recommendedOutcomes))state.outcomes=plan.outcomes.slice()
    state.recommendedOutcomes=plan.outcomes.slice()
    if(!fieldValue('audience'))document.getElementById('audience').value=plan.audience
    if(!fieldValue('offer'))document.getElementById('offer').value=plan.offer
    var urgent=discovery.startingPoint==='income'||['urgent','month'].indexOf(discovery.incomeTiming)>=0
    var pressure=discovery.riskMindset==='pressured'
    var timeDescriptions={'under-3':'less than 3 reliable hours per week','3-8':'3 to 8 reliable hours per week','9-20':'9 to 20 reliable hours per week','over-20':'more than 20 available hours per week',varies:'a schedule that changes week to week',unsure:'a weekly schedule that is still uncertain'}
    var time=timeDescriptions[discovery.weeklyTime]||'the time you have available'
    var target=!isUnknownAnswer(discovery.incomeTarget)?' Your stated target is '+discovery.incomeTarget+'.':''
    var laneOne=urgent?'Near-term lane':'First evidence lane'
    var immediate=plan.immediate
    if(discovery.resources.indexOf('none')>=0)immediate='Start inside the free Beslyfe community: ask three to five people what small problem they would trust you to help solve, choose one response to test, and do not spend money before you have evidence.'
    var riskItem=pressure?'<li><strong>Pressure check:</strong> do not accept illegal, deceptive, unsafe, or high-debt shortcuts. Slow down any decision that asks for money, secrecy, credentials, or immediate commitment.</li>':''
    var noGuarantee=urgent?'<li><strong>Reality check:</strong> this is a test plan, not guaranteed income. If essentials or safety are at immediate risk, use appropriate local support services too.</li>':'<li><strong>Decision gate:</strong> do not expand until real people respond, participate, book, or buy.</li>'
    var contextItems=''
    if(!isUnknownAnswer(discovery.strengths))contextItems+='<li><strong>Strength clue:</strong> '+esc(discovery.strengths)+'</li>'
    if(!isUnknownAnswer(discovery.problemsUnderstood))contextItems+='<li><strong>Real-life knowledge:</strong> '+esc(discovery.problemsUnderstood)+'</li>'
    if(!isUnknownAnswer(discovery.hardLimits))contextItems+='<li><strong>Plan boundary:</strong> '+esc(discovery.hardLimits)+'</li>'
    if(discovery.resources.indexOf('none')>=0)contextItems+='<li><strong>Resource rule:</strong> begin with free community conversations and what is already available; do not borrow to fund an unproven idea.</li>'
    document.getElementById('pathRecommendation').innerHTML='<h3>'+esc(plan.label)+'</h3><p>Recommended for '+esc(time)+'.'+esc(target)+'</p><ul><li><strong>'+esc(laneOne)+':</strong> '+esc(immediate)+'</li><li><strong>Longer-term lane:</strong> '+esc(plan.durable)+'</li>'+contextItems+riskItem+noGuarantee+'</ul>'
    state.guidanceSummary=plan.label+' | '+laneOne+': '+immediate+' | Longer-term lane: '+plan.durable
    renderProducts()
    renderOutcomes()
    recommend()
    syncSalesDefaults()
  }

  function selectedSalesProvider() { var key=document.getElementById('salesProvider').value;return salesProviders().find(function(item){return item.key===key})||null }
  function normalizedPaymentHandle(provider,value) { if(!provider||provider.entry!=='handle')return '';var handle=String(value||'').trim().replace(/^[@$]+/,'');if(!handle)return '';try{return new RegExp(provider.handlePattern).test(handle)?handle:''}catch(_){return ''} }
  function paymentDestination(provider,value) { if(!provider)return '';var raw=String(value||'').trim();if(provider.entry==='built-in')return '';if(provider.entry==='handle'){var handle=normalizedPaymentHandle(provider,raw);return handle?provider.destinationTemplate.replace('{handle}',encodeURIComponent(handle)):''}return /^https:\/\/[^\s]+$/i.test(raw)?raw:'' }
  function syncPaymentPreview() { var provider=selectedSalesProvider(),input=document.getElementById('salesDestination'),preview=document.getElementById('paymentUrlPreview');var url=paymentDestination(provider,input.value);preview.hidden=!url;if(url){preview.href=url;preview.textContent='Beslyfe will use: '+url}else{preview.removeAttribute('href');preview.textContent=''} }
  function syncPaymentField() { var provider=selectedSalesProvider(),field=document.getElementById('salesDestinationField'),input=document.getElementById('salesDestination'),label=document.getElementById('salesDestinationLabel'),help=document.getElementById('salesDestinationHelp'),note=document.getElementById('paymentProviderNote');if(!provider)return;field.hidden=provider.entry==='built-in';note.hidden=provider.entry==='built-in';input.value=state.paymentInputs[provider.key]||'';if(provider.entry==='handle'){label.textContent=provider.label+' username';input.type='text';input.placeholder=provider.handleExample||'@username';help.textContent='Enter only your @username. Beslyfe fills in and previews the complete '+provider.label+' payment URL.';note.textContent='Use a business or commercial profile when the provider requires one for sales.'}else if(provider.entry!=='built-in'){label.textContent='Secure '+provider.label+' link';input.type='url';input.placeholder='https://';help.textContent=provider.label+' requires a link created in its dashboard. Paste that secure link here.';note.textContent='Stripe, Square, Shopify, and booking services issue unique checkout links instead of username-based links.'}syncPaymentPreview() }
  function renderSales() { var mode=document.getElementById('salesMode'),provider=document.getElementById('salesProvider'),input=document.getElementById('salesDestination');mode.innerHTML=salesModes().map(function(item){return '<option value="'+esc(item.key)+'">'+esc(item.label)+'</option>'}).join('');syncSalesDefaults();mode.addEventListener('change',renderProviders);provider.addEventListener('change',syncPaymentField);input.addEventListener('input',function(){state.paymentInputs[provider.value]=input.value;syncPaymentPreview()}) }
  function syncSalesDefaults() { var mode=document.getElementById('salesMode');if(!mode)return;if(state.outcomes.indexOf('online-sales')>=0)mode.value='product';else if(state.outcomes.indexOf('bookings')>=0||state.outcomes.indexOf('book-opportunities')>=0)mode.value='booking';else if(state.outcomes.indexOf('donations')>=0)mode.value='donation';else if(state.outcomes.indexOf('ticket-sales')>=0)mode.value='ticket';else mode.value='lead';renderProviders() }
  function renderProviders() { var mode=document.getElementById('salesMode').value;var host=document.getElementById('salesProvider');host.innerHTML=salesProviders().filter(function(item){return (item.supports||[]).indexOf(mode)>=0}).map(function(item){return '<option value="'+esc(item.key)+'">'+esc(item.label)+'</option>'}).join('');if(mode==='lead')host.value='contact-form';syncPaymentField() }

  function showStep(n) { state.step=Math.max(1,Math.min(maxSteps,n));document.querySelectorAll('.builder-step').forEach(function(el){el.classList.toggle('active',Number(el.getAttribute('data-step'))===state.step)});document.querySelectorAll('.step-dots button').forEach(function(btn){var v=Number(btn.getAttribute('data-go'));btn.classList.toggle('active',v===state.step);btn.classList.toggle('done',v<state.step)});document.getElementById('progressFill').style.width=((state.step/maxSteps)*100)+'%';back.hidden=state.step===1;next.hidden=state.step===maxSteps;document.querySelector('.builder-card').scrollIntoView({behavior:'smooth',block:'start'}) }
  function validateStep() {
    if(state.step===1&&!state.startingPoint)return 'Choose the answer that is most honest right now.'
    if(state.step===2&&!fieldValue('incomeTiming'))return 'Tell Beslyfe how soon income matters, even if the answer is not sure.'
    if(state.step===2&&!fieldValue('weeklyTime'))return 'Choose the amount of time that is most realistic, even if it varies.'
    if(state.step===2&&!checkedValues('workPreference').length)return 'Choose at least one possible kind of work, including I truly do not know yet.'
    if(state.step===2&&!checkedValues('availableResource').length)return 'Choose at least one available resource, including none of these yet.'
    if(state.step===2&&!selectedValue('riskMindset'))return 'Choose what whatever it takes means for you, or choose that it does not apply.'
    if(state.step===2&&!document.getElementById('safetyCommitment').checked)return 'Confirm the legal, honest, safe boundary before Beslyfe recommends a path.'
    if(state.step===3&&!document.querySelector('input[name="productType"]:checked'))return 'Keep the recommended build type or choose a different one.'
    if(state.step===4&&!state.outcomes.length)return 'Choose at least one outcome.'
    if(state.step===5&&(!fieldValue('audience')||!fieldValue('offer')))return 'Tell Beslyfe who this is for and what you will help them do.'
    return ''
  }
  function showError(message) { var old=document.querySelector('.builder-error');if(old)old.remove();var p=document.createElement('p');p.className='builder-error';p.style.color='#b42318';p.style.fontWeight='700';p.textContent=message;document.querySelector('.builder-step.active').appendChild(p) }

  function snapshotForm(stepOverride) {
    var fields={}
    var selections={}
    form.querySelectorAll('input,select,textarea').forEach(function(field){
      var type=String(field.type||'').toLowerCase()
      if(type==='radio'||type==='checkbox'){
        if(field.name){if(!selections[field.name])selections[field.name]=[];if(field.checked)selections[field.name].push(field.value)}
        else if(field.id)fields[field.id]=Boolean(field.checked)
      }else if(field.id)fields[field.id]=field.value
    })
    return {version:1,step:Number(stepOverride||state.step),state:{startingPoint:state.startingPoint,productType:state.productType,productChosenManually:state.productChosenManually,recommendedProduct:state.recommendedProduct,recommendedOutcomes:state.recommendedOutcomes,outcomes:state.outcomes,capabilities:state.capabilities,guidanceSummary:state.guidanceSummary,paymentInputs:state.paymentInputs},fields:fields,selections:selections,savedAt:new Date().toISOString()}
  }

  function readLocalDraft() { try { var value=JSON.parse(localStorage.getItem(localDraftKey)||'null');return value&&typeof value==='object'?value:null } catch(_){return null} }

  function writeLocalDraft(stepOverride) {
    var snapshot=snapshotForm(stepOverride)
    try { localStorage.setItem(localDraftKey,JSON.stringify(snapshot)) } catch(_) {}
    return snapshot
  }

  function applySnapshot(snapshot) {
    if(!snapshot||typeof snapshot!=='object')return
    var savedState=snapshot.state&&typeof snapshot.state==='object'?snapshot.state:{}
    ;['startingPoint','productType','recommendedProduct','guidanceSummary'].forEach(function(key){if(typeof savedState[key]==='string')state[key]=savedState[key]})
    ;['recommendedOutcomes','outcomes','capabilities'].forEach(function(key){if(Array.isArray(savedState[key]))state[key]=savedState[key]})
    state.productChosenManually=Boolean(savedState.productChosenManually)
    state.paymentInputs=savedState.paymentInputs&&typeof savedState.paymentInputs==='object'?savedState.paymentInputs:{}
    renderProducts();renderOutcomes();recommend();syncSalesDefaults()
    Object.keys(snapshot.fields||{}).forEach(function(id){var field=document.getElementById(id);if(!field)return;if(typeof snapshot.fields[id]==='boolean')field.checked=snapshot.fields[id];else field.value=snapshot.fields[id]})
    Object.keys(snapshot.selections||{}).forEach(function(name){var chosen=new Set(snapshot.selections[name]||[]);document.querySelectorAll('input[name="'+name+'"]').forEach(function(field){field.checked=chosen.has(field.value)})})
    state.startingPoint=selectedValue('startingPoint')||state.startingPoint
    state.productType=selectedValue('productType')||state.productType
    state.outcomes=checkedValues('outcome').length?checkedValues('outcome'):state.outcomes
    updateStartingResponse();if(Number(snapshot.step)>=3)applyDiscoveryRecommendation();else recommend();syncSalesDefaults();syncPaymentField();showStep(Number(snapshot.step)||1)
  }

  function remoteSave(snapshot) {
    if(!state.account)return Promise.resolve(null)
    return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save-draft',draft:snapshot})}).then(function(response){if(!response.ok)throw new Error('save');return response.json()}).then(function(){builderSaveState.innerHTML='<strong>Saved to your account.</strong><span>You can close this page and resume later.</span>';return true}).catch(function(){builderSaveState.innerHTML='<strong>Saved on this device.</strong><span>The account copy could not update yet; Beslyfe will retry after your next answer.</span>';return null})
  }

  function scheduleSave(stepOverride) {
    var snapshot=writeLocalDraft(stepOverride)
    if(!state.account)return snapshot
    clearTimeout(saveTimer)
    saveTimer=setTimeout(function(){remoteSave(snapshot)},450)
    return snapshot
  }

  function clearSavedDraft() {
    try { localStorage.removeItem(localDraftKey) } catch(_) {}
    if(state.account)fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete-draft'})}).catch(function(){})
  }

  function newerDraft(localDraft,serverDraft) {
    if(!localDraft)return serverDraft
    if(!serverDraft)return localDraft
    return Date.parse(localDraft.savedAt||0)>=Date.parse(serverDraft.savedAt||0)?localDraft:serverDraft
  }

  var exampleByProduct={publisher:{audience:'Readers who want practical, trustworthy ideas they can use and share.',offer:'A consistent publication with clear topics, useful resources, and an easy way to subscribe.',challenge:'Planning, drafting, publishing, distribution, and follow-up are scattered across too many tools.',automation:'Prepare the publishing checklist, repurpose approved posts, schedule reminders, and summarize what performs.'},creator:{audience:'Brands, photographers, clients, collaborators, and supporters looking for the right creative fit.',offer:'A portfolio and media kit that make it easy to understand the work and request a booking.',challenge:'Inquiries, availability, project details, follow-ups, and content updates take time away from creative work.',automation:'Organize inquiries, remind me about follow-ups, prepare booking details, and surface the next best opportunity.'},retail:{audience:'Local shoppers, online customers, store employees, and suppliers.',offer:'Make products easy to discover and buy while giving staff one dependable way to run the day.',challenge:'Inventory updates, staff handoffs, promotions, supplier follow-up, and daily reporting happen in different places.',automation:'Flag low stock, prepare task reminders, follow up with customers, and create one daily operating summary.'},property:{audience:'Property owners, prospective tenants, current residents, vendors, and the management team.',offer:'A dependable place for listings, applications, maintenance, payments, inspections, and clear communication.',challenge:'Requests arrive through different channels and maintenance, rent, inspections, and owner updates are easy to miss.',automation:'Triage requests, route work, send approved reminders, track deadlines, and prepare owner reports.'},custom:{audience:'The people who use, deliver, support, or benefit from the idea.',offer:'A clear result that is easier to request, deliver, measure, and improve.',challenge:'Important work repeats manually, information is scattered, and nobody has one complete view.',automation:'Handle repeatable steps, reminders, summaries, and handoffs while keeping approvals under human control.'},default:{audience:'People who need a trustworthy, simple solution and want to understand their options before they act.',offer:'A clear first step that solves one urgent problem, proves the value, and makes it easy to continue.',challenge:'Leads, tasks, follow-ups, content, and reporting are spread across different tools.',automation:'Organize the next actions, prepare follow-ups, send approved reminders, and summarize what needs attention.'}}

  next.addEventListener('click',function(){var error=validateStep();if(error){showError(error);return}if(state.step===2){applyDiscoveryRecommendation();if(!state.account){scheduleSave(3);showAccountCheckpoint('Your answers are saved on this device. Create or sign in to your free account to keep going from Question 3.');return}}if(state.step===3||state.step===4||state.step===5)recommend();showStep(state.step+1);scheduleSave()})
  back.addEventListener('click',function(){showStep(state.step-1);scheduleSave()})
  document.querySelectorAll('.step-dots button').forEach(function(btn){btn.addEventListener('click',function(){var target=Number(btn.getAttribute('data-go'));if(target<state.step)showStep(target)})})
  document.getElementById('startingChoices').addEventListener('change',updateStartingResponse)
  document.getElementById('incomeTiming').addEventListener('change',syncIncomeDetails)
  document.querySelectorAll('input[name="riskMindset"]').forEach(function(input){input.addEventListener('change',updateDiscoverySupport)})
  document.getElementById('productChoices').addEventListener('change',function(event){state.productType=event.target.value;state.productChosenManually=true;recommend()})
  document.getElementById('outcomeChoices').addEventListener('change',function(){state.outcomes=checkedValues('outcome');recommend();syncSalesDefaults()})
  document.querySelector('.example-answer').addEventListener('click',function(){var example=exampleByProduct[state.productType]||exampleByProduct.default;document.getElementById('audience').value=example.audience;document.getElementById('offer').value=example.offer;document.getElementById('operatingChallenge').value=example.challenge;document.getElementById('automationWish').value=example.automation})
  form.addEventListener('input',function(){scheduleSave()})
  form.addEventListener('change',function(){scheduleSave()})

  function draft() {
    var minimumAge=Number(document.getElementById('minimumAge').value||0)
    var discovery=readDiscovery()
    return {action:'create',name:fieldValue('projectName'),description:fieldValue('projectDescription'),productType:state.productType,outcomes:state.outcomes,primaryOutcome:state.outcomes[0]||'community-growth',capabilities:state.capabilities,minimumAge:minimumAge,contentRating:minimumAge>=18?'regulated-adult':'general',answers:{startingPoint:discovery.startingPoint,incomeTiming:discovery.incomeTiming,incomeTarget:discovery.incomeTarget,currentIncome:discovery.currentIncome,weeklyTime:discovery.weeklyTime,strengths:discovery.strengths,problemsUnderstood:discovery.problemsUnderstood,workPreferences:discovery.workPreferences,resources:discovery.resources,startingExperiment:deriveExperiment(discovery),hardLimits:discovery.hardLimits,riskMindset:discovery.riskMindset,safetyCommitment:discovery.safetyCommitment,guidanceSummary:state.guidanceSummary,audience:fieldValue('audience'),offer:fieldValue('offer'),operatingChallenge:fieldValue('operatingChallenge'),automationWish:fieldValue('automationWish'),minimumAge:minimumAge}}
  }
  function renderResult(item,channel) { form.hidden=true;var host=document.getElementById('builderResult');host.hidden=false;var caps=(item&&item.capabilities)||state.capabilities;host.innerHTML='<div class="result-mark">✓</div><h2>Your Beslyfe action workspace is ready.</h2><p><strong>'+esc(item.name)+'</strong> now has a seven-day execution queue, measurable outcomes, and a modular capability plan. The first safe bot task is prepared automatically from your answers.</p><div class="result-capabilities">'+caps.map(function(x){return '<span>'+esc(labels[x]||x)+'</span>'}).join('')+'</div>'+(channel?'<p class="result-note">Your <strong>'+esc(channel.actionLabel)+'</strong> growth action is active through '+esc(channel.provider)+'.</p>':'<p class="result-note">External actions still require a target preview and fresh approval. Ticketing remains '+(caps.indexOf('ticketing')>=0?'enabled by choice':'off')+'.</p>')+'<div class="result-actions"><a class="button" href="/workspace?ecosystem='+encodeURIComponent(item.id)+'">Start my first test</a><a class="button secondary" href="/community">Enter the community</a></div>' }
  form.addEventListener('submit',function(e){e.preventDefault();if(!state.account){scheduleSave(7);showAccountCheckpoint('Create or sign in to your free account to save and create this plan. Every answer will be waiting when you return.');return}var payload=draft();if(!payload.name){showError('Give your project a name.');return}var chosenProvider=selectedSalesProvider(),paymentInput=document.getElementById('salesDestination').value.trim(),preparedUrl=paymentDestination(chosenProvider,paymentInput);if(paymentInput&&!preparedUrl){showError(chosenProvider&&chosenProvider.entry==='handle'?'Enter a valid '+chosenProvider.label+' @username.':'Paste a complete secure https payment link.');return}var button=document.getElementById('launchButton');button.disabled=true;button.textContent='Creating...';fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Could not create the plan.');return d})}).then(function(data){clearSavedDraft();var mode=document.getElementById('salesMode').value;var provider=selectedSalesProvider();var raw=document.getElementById('salesDestination').value.trim();var url=paymentDestination(provider,raw);if(!url&&mode==='lead'&&provider&&provider.key==='contact-form'&&state.outcomes.indexOf('qualified-leads')>=0)url='/contact?ecosystem='+encodeURIComponent(data.item.id);if(!url)return {item:data.item,channel:null};return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'growth-channel',ecosystemId:data.item.id,mode:mode,provider:provider.key,paymentHandle:provider.entry==='handle'?raw:'',offerName:fieldValue('offer').slice(0,200)||data.item.name,actionLabel:(salesModes().find(function(x){return x.key===mode})||{}).actionLabel,destinationUrl:url})}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'The plan was saved, but the growth link needs attention.');return {item:data.item,channel:d.item}})})}).then(function(result){renderResult(result.item,result.channel)}).catch(function(err){button.disabled=false;button.textContent='Create my Beslyfe plan';showError(err.message)})})

  function initializeBuilder(snapshot) {
    var params=new URLSearchParams(location.search)
    var starting=params.get('starting')
    if(['known','ideas','unsure','income'].indexOf(starting)>=0){
      state.startingPoint=starting
      var startingInput=document.getElementById('start-'+starting)
      if(startingInput)startingInput.checked=true
      updateStartingResponse()
    }
    var requested=params.get('type')
    if(products().some(function(x){return x.key===requested})){
      state.startingPoint='known'
      state.productType=requested
      state.productChosenManually=true
      var known=document.getElementById('start-known')
      if(known)known.checked=true
      updateStartingResponse()
    }
    var goal=params.get('goal')
    if(outcomes().some(function(x){return x.key===goal}))state.outcomes=[goal]
    renderProducts()
    renderOutcomes()
    renderSales()
    recommend()
    syncSalesDefaults()
    if(snapshot)applySnapshot(snapshot)
    else if(starting||requested)showStep(2)
  }

  async function boot() {
    var sessionData=null
    try { var sessionResponse=await fetch('/.netlify/functions/auth?action=session',{headers:{Accept:'application/json'}});if(sessionResponse.ok)sessionData=await sessionResponse.json() } catch(_) {}
    state.account=sessionData&&sessionData.account?sessionData.account:null
    try { var contractResponse=await fetch(endpoint+'?type=blueprints');if(contractResponse.ok)state.contracts=await contractResponse.json() } catch(_) { state.contracts=null }
    unlockBuilder(state.account)
    var localDraft=readLocalDraft()
    var serverDraft=null
    if(state.account){
      try { var draftResponse=await fetch(endpoint+'?type=draft',{headers:{Accept:'application/json'}});if(draftResponse.ok){var draftData=await draftResponse.json();serverDraft=draftData&&draftData.item?draftData.item.payload:null} } catch(_) {}
    }
    var snapshot=newerDraft(localDraft,serverDraft)
    initializeBuilder(snapshot)
    if(!state.account&&snapshot&&Number(snapshot.step)>=3){showAccountCheckpoint('Your saved answers are ready. Create or sign in to your free account to continue from Question '+Number(snapshot.step)+'.');return}
    if(state.account&&snapshot)remoteSave(snapshot)
  }

  boot()
})()
