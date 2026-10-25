# Daylight

A personal assistant for the daily decision of what to do when. Add work and
personal tasks, estimates and priorities; Daylight fits them around fixed
appointments, leaves breaks, and shows what does not fit. Work and personal
tasks share the day by default, as requested by the project's first user.

## Run

Requires Node.js 20 or newer. No npm install or build step is needed.

```sh
cd daylight
npm start
```

Open **http://127.0.0.1:4174**. If this README is already in your current
directory, omit `cd daylight`. Set `PORT` to change the port. The server binds
to loopback only. Opening `dist/index.html` directly is not supported because
the app uses JavaScript modules and a worker.

For static hosting, serve the contents of `dist/` over HTTPS with JavaScript
MIME types. There is no server API, secret, or database to configure.

## Use

1. Set the planning date and the hours you have available. Choose **Mix
   throughout the day** or separate work hours. Press **Update day**.
2. Add fixed appointments, including meals or any immovable commitments.
3. Add tasks with a work/personal category, high/medium/low priority and a
   duration. Optionally give an earliest start or finish-by deadline.
4. The schedule updates when tasks or appointments change. It explains each
   placement and lists tasks that do not fit under **For another time**.
5. Complete tasks using their checkboxes. For today's date, completion moves
   the planning cursor forward to the current device time and replans
   incomplete tasks. For other dates it retains your chosen cursor.
6. Use **Plan from** and **Replan remaining tasks** when running late or
   planning from a different time. Changing the day settings explicitly resets
   the cursor to the day's start. Completed tasks remain complete.

**Try a sample day** loads fictional data, demonstrating a mix of work and
personal tasks, fixed meetings, breaks, and a task too large to fit. It asks
before replacing existing data. The sample does not exercise the AI model.

### Local AI notes reader

Write a rough task list in the notes box, **one task per line** (up to 12 lines,
180 characters per line). Your original task wording is kept; the model
classifies each line separately so it cannot drop a task from the list.
Open **About local AI & the first
download**, then choose **Download & enable local AI**. Once the model is
ready, choose **Read my notes**. Review and edit every suggested task before
adding the batch. If a generated estimate is missing or outside 5–480 whole
minutes, its review field is highlighted. Correct it before adding the batch;
the app does not silently replace it with a default. Optional times come from
explicit source phrases such as **before 5pm**, **after 09:30**, or **by noon**.
Without a time phrase, both fields stay blank. The model cannot supply these
fields. Ambiguous source phrases such as **before 5**, **after lunch**, a future
date, or an explicitly named unsupported time zone remain visible for correction;
enter `17:00`, for example, or clear a field if the constraint does not apply.
This is a limited parser, not general natural-language date understanding.

Optional **Work:** / **Personal:** labels, **high/medium/low priority**, and
durations such as **45 min** or **2 hours** override the corresponding AI guesses.
Ordinary task lines need none of these annotations. The original line, including
annotations, is preserved as the editable task title. Category, priority and
duration are suggestions when not explicitly provided; the user has
the final say. No model output directly changes the schedule or a calendar.

AI-inferred durations are constrained to a menu of minute blocks:
5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, or 480. This prevents a bare
number such as “week 3” from becoming an invalid three-minute estimate. Explicit
user estimates, such as **37 minutes**, override the menu. These blocks constrain
the output format; they do not prove that the estimate is accurate.

The prompt includes examples of professional work, holiday preparation, pet
care, optional chores and numbers that are not durations. It treats unclear
urgency as medium priority. These prompt changes still need real-model quality
checks; category and priority should be reviewed, especially for ambiguous tasks.

The implementation uses the open-weight
[Qwen2.5 0.5B Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)
model through its
[MLC WebGPU build](https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f32_1-MLC)
and [WebLLM 0.2.85](https://webllm.mlc.ai/docs/user/basic_usage.html).
WebLLM runs in a worker to keep the UI responsive. It receives an explicit
JSON Schema string, and application code validates each result before review.

The first model load downloads several hundred MB and requires an internet
connection, a compatible WebGPU device, and an HTTPS or loopback origin.
Desktop Chrome or Edge with hardware acceleration is a useful starting point.
The exact download and GPU resource usage depend on the runtime and cache.
The model is loaded again after a page reload; cached model files may reduce
downloads. The app remembers successful initial enablement in this browser.
On later visits, **Read my notes** loads the model when needed, so the separate
enable button is not required each time. Clearing browser storage forgets this
choice. Manual entry and scheduling work without loading the model.

## How scheduling works

```text
Task lines → one local-model classification per line → editable suggestions
Explicit source metadata → time constraints and overrides, outside generation
                                      ↓ user accepts
Tasks + priorities + estimates + appointments + available hours
                                      ↓
                   deterministic interval scheduling
                                      ↓
                   timeline + breaks + explicit overflow
```

Tasks are considered by priority first, deadline second, and input order third.
Each task gets the earliest uninterrupted slot that fits its entire duration,
earliest start, deadline, and category hours. Appointments are never moved.
After each task a configurable break is reserved, shortened if an appointment
or day end follows sooner. Remaining gaps can be used by smaller tasks.

This is a greedy heuristic, not a claim of globally optimal scheduling. It
can defer a high-priority task while fitting shorter tasks into remaining
gaps. Estimates are never silently shortened; tasks are never automatically
split. Break time can mean a task no longer fits. Priority is user intent:
a lower-priority task with an urgent deadline does not displace a high-priority
one automatically.

The scope is one local calendar date, in wall-clock hours. Overnight days,
dependencies, recurring tasks, calendar sync, notifications, background
automation and multi-device sync are not implemented. Changing the date keeps
the current task list and its completion states; use edit controls as needed.

## Data and privacy

Tasks, notes, settings and the planning cursor are stored in browser
`localStorage` under `daylight-v1`. A separate `daylight-ai-enabled-v1` flag
remembers model enablement; it is local to this browser and is not in backups.
**Backup** downloads a JSON file, and
**Restore** validates a backup before replacing the current plan. There is no
account or cloud storage. Browser storage is not encrypted and clearing site
data deletes the saved plan. Notes are included in backups.

Model inference processes notes on the user's device. Enabling AI fetches
runtime/model files from external hosts (esm.run and the model/runtime
providers); this is not a claim that the entire app makes no network requests.
No external fonts, analytics, or hosted inference API are used. The app shell
does not install a service worker, so offline reload support is not guaranteed.

## Verification

```sh
npm test
```

The suite contains 23 scheduling/data tests, including 120 generated scenarios,
twelve AI contract/error tests, eight source-note parsing tests, three server request tests, and four error-notice
tests. It verifies overlap, duration and boundary
invariants, deadlines, mixed/separate hours, overflow, completion handling,
backups, the JSON schema request, invalid model output, successful page/asset
responses, rejection of paths outside the static directory, and visible notices
for worker errors returned as strings or without a message. The AI tests use
test doubles; they do not establish real-model extraction accuracy.

In the build environment, all 50 tests pass, but sandbox restrictions prevent
opening a loopback server or launching Chromium. The user tested the desktop UI
and local-model path during development on 25 October, providing screenshots
that exposed the issues documented below. A recorded walkthrough of the release
is still needed; see [the demo recording guide](docs/DEMO.md). No time-savings
or general model-quality measurement has yet been made.

### Troubleshooting the notes reader

The WebLLM worker can reject with a plain-text error rather than an `Error`
object. Daylight preserves that text in the red notice and always supplies
fallback text if the worker provides no details. A failing read leaves saved
tasks unchanged and clears suggestions from earlier reads.

The generation schema is one small object containing category, priority and
duration. Task names, task counts and time constraints are controlled by source
lines and application code, rather than by model output. Bad estimates and
unsupported explicit time phrases are flagged for correction in the review
screen. Strict time and duration checks still apply before saving or scheduling.

The original, more complex generation schema caused a reported
`GrammarMatcherInitError`; the exact native assertion was not exposed. A simpler
schema then reached task validation, but the model generated unsupported date
strings and omitted one source task. The current per-line classification and
source-only time handling address those failure modes in regression tests.
Full real-model quality evaluation remains pending.
If the runtime aborts, Daylight discards the worker and enables
**Reload local AI** to start a fresh runtime.

If generation fails, copy the complete notice text to diagnose the runtime
failure. After refreshing the page, enable local AI again before reading
notes. The download may use cached model files. Changing the error display
does not establish that the underlying inference failure has been resolved.

### Browser walkthrough before submission

- Start the app, load the sample, check the two fixed appointments and overflow.
- Add a personal high-priority task, change its duration, and verify the plan
  updates. Confirm an overlapping appointment is rejected.
- Test a task that cannot meet its deadline; it must stay unscheduled.
- Complete a task, replan from a later time, reload, and check the saved cursor.
- Back up and restore the plan. Check the layout and keyboard focus on a narrow
  screen as well as desktop.
- Load the actual model and test a real mixed task list. Verify categories,
  durations, priorities and explicit times in the review screen. Record errors
  honestly; the model is small and its suggestions can be wrong.

## Hacktoberfest Week 3

This project was started on 23 October 2026 for
[Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19).
Its intended payoff is less time deciding what to do next and less effort
reworking a day when plans change. Local inference keeps potentially personal
work and life notes on the user's device while leaving the interpretation
prompt, weights and scheduling rules open to inspection and change.

The [official challenge rules](https://dev.to/page/hacktoberfest-week3-2026-10-19-contest-rules)
require a new project, a public code link, a deployed or video demo, and a DEV
post using the provided template and `hf26challenge` tag. The template also
includes `devchallenge`. The official deadline is 25 October 2026 at 11:59 PM
PDT, which is 26 October at 06:59 in London. The event API has an inconsistent
end timestamp; the official rules are the reference here.

Submission sections: What I Built; Demo; Code; How I Built It; Why Does Open
Innovation Matter? Optional sections: My Agent Session; The Lazy Payoff;
Prize Categories. Writing is weighted most heavily. This implementation does
not yet have a verified live demo, public repository, measured user result,
or published submission. No partner-category eligibility is claimed.

### Community references

- [Building a CLI Task Manager That Solves the "When to Do It" Problem Taskwarrior Lacked](https://dev.to/kohei_wada/building-a-cli-task-manager-that-solves-the-when-to-do-it-problem-taskwarrior-lacked-581n),
  by [@kohei_wada](https://dev.to/kohei_wada): an example of transparent
  scheduling from estimates, priorities, and fixed capacity.
- [Plan My Day — Private Offline AI Timetable Planner](https://dev.to/ybrijwasi1010/plan-my-day-private-offline-ai-timetable-planner-jlg),
  by [@ybrijwasi1010](https://dev.to/ybrijwasi1010): a related local-model
  planner whose author reports structured-output and browser-origin issues.

Daylight uses its own scheduling implementation and user interface. Original
application code is MIT licensed; external model/runtime licenses apply to
their respective artifacts. Built with Codex assistance.
