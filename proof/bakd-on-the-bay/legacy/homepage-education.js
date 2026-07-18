
/**
 * homepage-education.js
 * Renders the homepage "Featured Speakers" spotlight from approved speaker
 * profiles in the database (the profiles function), plus the admin-built speaker
 * schedule (30-minute slots saved in site-settings), so admin changes show up
 * live without a separate data file. Respects the homepage CMS state from
 * homepage-admin-state.js (site publish + the "speakers" section toggle).
 */
async function loadEducationHomepage() {
  var adminApi = window.bayfrontAdmin || {};
  var adminState = (adminApi.getAdminState && adminApi.getAdminState()) || {};

  // Skip rendering when unpublished or when the speakers section is disabled.
  if (adminState.published === false) return;
  if (adminApi.sectionEnabled && !adminApi.sectionEnabled('speakers')) return;

  var featured = document.getElementById('featured-speakers');

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
  }

  // Convert a 24h "HH:MM" slot to a friendly 12-hour label.
  function timeLabel(hhmm) {
    var m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
    if (!m) return esc(hhmm || '');
    var h = parseInt(m[1], 10);
    var ampm = h < 12 ? 'AM' : 'PM';
    var h12 = ((h + 11) % 12) + 1;
    return h12 + ':' + m[2] + ' ' + ampm;
  }

  if (featured) {
    try {
      var res = await fetch('/.netlify/functions/profiles?role=speaker');
      var data = await res.json();
      var speakers = (data && data.items) || [];
      // Photo-forward speaker cards — a headshot leads each card, with the talk
      // topic underneath. Warmer and less cluttered than a wall of times.
      featured.innerHTML = speakers.slice(0, 6).map(function (s) {
        var d = s.details || {};
        var topic = d.topic || s.tagline || '';
        var photo = s.headshotUrl
          ? '<img class="showcase-logo" src="' + esc(s.headshotUrl) + '" alt="">'
          : '<div class="showcase-logo placeholder">' + esc(initials(s.displayName)) + '</div>';
        return '<a class="showcase-card" href="/profile?id=' + encodeURIComponent(s.id) + '">' +
          photo +
          '<h3>' + esc(s.displayName || 'Speaker') + '</h3>' +
          (topic ? '<p>' + esc(topic) + '</p>' : '') + '</a>';
      }).join('');
    } catch (e) {
      /* leave the section's CTA in place if the fetch fails */
    }
  }

  // The admin-built 30-minute schedule now lives behind a toggle so it no longer
  // dominates the section — the speaker photos lead, and session times are one tap
  // away for anyone who wants them.
  var upcoming = document.getElementById('upcoming-presentations');
  if (upcoming) {
    try {
      var sres = await fetch('/.netlify/functions/site-settings?page=homepage');
      var settings = await sres.json();
      var slots = (settings && settings.speakerSchedule) || [];
      if (slots.length) {
        var strip = '<div class="schedule-strip">' + slots.map(function (slot) {
          var photo = slot.image
            ? '<img class="sch-photo" src="' + esc(slot.image) + '" alt="">'
            : '<div class="sch-photo placeholder">' + esc(initials(slot.name)) + '</div>';
          var inner = '<span class="sch-time">' + esc(timeLabel(slot.time)) + '</span>' + photo +
            '<span><span class="sch-name">' + esc(slot.name || '') + '</span>' +
            (slot.topic ? '<br><span class="sch-topic">' + esc(slot.topic) + '</span>' : '') + '</span>';
          return slot.profileId
            ? '<a class="schedule-item" href="/profile?id=' + encodeURIComponent(slot.profileId) + '">' + inner + '</a>'
            : '<div class="schedule-item">' + inner + '</div>';
        }).join('') + '</div>';
        upcoming.innerHTML =
          '<div class="schedule-reveal">' +
            '<button class="btn schedule-toggle" type="button" aria-expanded="false" aria-controls="schedule-panel">' +
              '<span class="schedule-toggle-label">Show session times</span><span class="schedule-toggle-caret" aria-hidden="true">▾</span>' +
            '</button>' +
            '<div class="schedule-panel" id="schedule-panel" hidden>' + strip + '</div>' +
          '</div>';
        var toggle = upcoming.querySelector('.schedule-toggle');
        var panel = upcoming.querySelector('.schedule-panel');
        var label = upcoming.querySelector('.schedule-toggle-label');
        if (toggle && panel) {
          toggle.addEventListener('click', function () {
            var open = panel.hidden;
            panel.hidden = !open;
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (label) label.textContent = open ? 'Hide session times' : 'Show session times';
          });
        }
      } else {
        upcoming.innerHTML = '';
      }
    } catch (e) {
      upcoming.innerHTML = '';
    }
  }
}

document.addEventListener('DOMContentLoaded', loadEducationHomepage);
