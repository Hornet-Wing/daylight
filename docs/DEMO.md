# Daylight demo recording

Record a continuous two-to-three-minute walkthrough using fictional tasks. Show
the actual local model output, including any correction you make. This is a
functional demo, not a latency or accuracy benchmark.

## Prepare

Run `npm start` and open `http://127.0.0.1:4174`. Export a backup if you want to
keep the current plan. Use a fictional example day, with available hours from
09:00 to 15:00 and mixed work/personal tasks. A future date avoids completion
automatically moving the cursor to the real current time during the demo.

If the model is already loaded or its files are cached, say so. The first
download requires several hundred MB and compatible WebGPU hardware. Keep the
inference wait in the recording, or clearly label any cut.

## Walkthrough

1. **Introduce the problem.** “I want to write down what needs doing, then see
   a realistic day around my appointments. Work and personal tasks share it.”
2. **Paste three fictional tasks, one per line:**

   ```text
   Work: prepare a client update, high priority, 45 minutes, before 12:00
   Pack a bag for a trip
   Wash the pet bowls
   ```

3. **Read the notes.** Click **Read my notes** and show the task-by-task progress.
   The first task has explicit category, priority, duration and deadline. The
   other two exercise the model's suggestions. Their time fields should stay
   blank because their source lines have no time constraints.
4. **Review the result.** Show that all three original task lines are present.
   Correct any category, priority or estimate you disagree with. Explain that
   inferred estimates use time blocks, and that the person accepts the final
   values. Do not hide a wrong suggestion or describe it as a correct result.
5. **Accept the tasks.** Click **Add reviewed tasks**. Show their placement,
   break blocks and the explanation beneath each task.
6. **Add a fixed appointment.** Add lunch from 12:30 to 13:00. Show that tasks
   fit around it; the appointment is not moved.
7. **Demonstrate capacity.** Manually add “Sort all the old project folders”,
   personal, low priority, 480 minutes. It cannot fit into this six-hour day
   and should appear under **For another time**, without a shortened estimate.
8. **Show a change of plan.** Complete one task, set **Plan from** to 13:00,
   then choose **Replan remaining tasks**. If the client-update task is still
   incomplete, its noon deadline cannot be met; show that it is deferred with
   an explanation rather than scheduled late.
9. **Finish with data ownership.** Show **Backup** or **Copy plan**. Mention
   browser-local storage and local inference, plus the one-time model download.

## Submission handoff

- Upload the recording somewhere judges can view without requesting access.
- Verify the video link in a signed-out/private browser window.
- Add that URL to the DEV draft's **Demo** section, and a public repository URL
  to **Code**.
- Check the demo shows the latest version. A screenshot alone does not satisfy
  the challenge's deployed-or-video demo requirement.
- Publish the DEV entry with `devchallenge` and `hf26challenge` before the
  official deadline: 26 October 2026, 06:59 London time.

The actual article publication is the challenge entry. Saving a draft does not
submit it.
