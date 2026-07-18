
/**
 * education-schedule.js
 * Renders the Education Station schedule from the admin-built schedule saved in
 * site-settings (`speakerSchedule` — 30-minute slots of { time, name, topic,
 * image, profileId }). This is the same source the Website CMS "Speaker
 * Schedule" panel writes to and the homepage reads, so what an admin publishes
 * in the CMS is exactly what shows here.
 *
 * Older builds read speaker `details.timeSlot` / `details.topic` off approved
 * profiles, but nothing ever wrote those fields, so this page always showed
 * "TBD". Reading the CMS schedule fixes that mismatch.
 */
async function loadSchedule() {
  var container = document.getElementById('schedule-container');
  if (!container) return;

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Convert a 24h "HH:MM" slot to a friendly 12-hour label (mirrors the homepage).
  function timeLabel(hhmm) {
    var m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) return esc(hhmm || 'TBD');
    var h = parseInt(m[1], 10);
    var ampm = h < 12 ? 'AM' : 'PM';
    var h12 = ((h + 11) % 12) + 1;
    return h12 + ':' + m[2] + ' ' + ampm;
  }

  try {
    var res = await fetch('/.netlify/functions/site-settings?page=homepage');
    var settings = await res.json();
    var slots = (settings && settings.speakerSchedule) || [];

    if (!slots.length) {
      container.innerHTML = '<p class="empty">The speaker schedule is being finalized — check back soon.</p>';
      return;
    }

    function initials(name) {
      var parts = String(name || '?').trim().split(/\s+/);
      return (((parts[0] || '')[0] || '?') + ((parts[1] || '')[0] || '')).toUpperCase();
    }

    // Photo-forward: each session leads with the speaker's picture, then the time
    // and topic — the same warm, on-brand card used across the site.
    container.innerHTML = '<div class="schedule-strip">' + slots.map(function (slot) {
      var photo = slot.image
        ? '<img class="sch-photo" src="' + esc(slot.image) + '" alt="">'
        : '<div class="sch-photo placeholder">' + esc(initials(slot.name)) + '</div>';
      var inner = photo +
        '<span class="sch-body">' +
          '<span class="sch-time">' + timeLabel(slot.time) + '</span>' +
          '<span class="sch-name">' + esc(slot.name || 'TBD') + '</span>' +
          (slot.topic ? '<span class="sch-topic">' + esc(slot.topic) + '</span>' : '') +
        '</span>';
      return slot.profileId
        ? '<a class="schedule-item" href="/profile?id=' + encodeURIComponent(slot.profileId) + '">' + inner + '</a>'
        : '<div class="schedule-item">' + inner + '</div>';
    }).join('') + '</div>';
  } catch (e) {
    container.innerHTML = '<p class="empty">Could not load the schedule right now.</p>';
  }
}

document.addEventListener('DOMContentLoaded', loadSchedule);
