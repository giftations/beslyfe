# CRM Pipeline + Follow-Up Engine

Beslyfe uses one CRM model for every ecosystem. Bak'd On The Bay is the first implementation, but the records are designed for future events, sponsors, vendors, advertisers, speakers, partners, and attendees.

## People

`crm_people` stores one row per human. A person may have many roles through `crm_person_roles`, and may be linked to one canonical company through `company_id`. People carry pipeline fields for relationship work: status, tags, lead source, pipeline stage, owner, follow-up date, last contacted date, lifetime value, priority, and flexible `details`.

## Companies

`crm_companies` stores one row per organization. Sponsorships, vendor participation, advertising, and partnerships should all reference this company record instead of copying company data into separate systems. A company can be linked to many events through `crm_company_events`.

## Activities

`crm_activities` is the unified timeline for people and companies. Notes, calls, emails, meetings, tasks, status changes, payments, applications, sponsorships, advertising, and other relationship context all land here. Activity creation is best-effort when triggered from other workflows, so CRM context never breaks public submissions, ad setup, profile moderation, or ticket imports.

## Pipeline Stages

Default stages are: `new`, `contacted`, `interested`, `application_started`, `application_submitted`, `approved`, `payment_pending`, `paid`, `onboarded`, `active`, `follow_up_needed`, `closed_won`, and `closed_lost`.

These are centralized in the CRM function and admin UI so they can become configurable later without replacing the CRM model.

## Follow-Ups

Admins should set `follow_up_at` whenever a relationship needs a next action. The CRM pages show overdue, today, upcoming, and unscheduled follow-ups. Tasks created in the timeline can also be completed from the detail drawer.

## Ecosystem Use

Sponsorship, vending, advertising, and event participation all flow into the same people, companies, and activities. That keeps Bak'd On The Bay from becoming a one-off event admin tool and supports Beslyfe's larger purpose: reusable infrastructure for human opportunity across many communities.
