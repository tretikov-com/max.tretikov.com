import { DISCUSSIONS_URL } from "./config.js";

const examples = [
  ["Biology is a data problem", "A local example about measuring living systems, useful models, and the experiments between them.", "<h2 id=measure-first>Measure first</h2><p>A model is only as useful as the measurements that can prove it wrong. In biology, deciding what to measure is often the hardest part.</p><blockquote><p>What would you need to observe to change your mind?</p></blockquote>"],
  ["Teaching a fast model slow physics", "What might a cheap approximation learn from a very expensive teacher?", "<h2 id=the-teacher>The teacher and the student</h2><p>Use an expensive calculation to evaluate a small number of decisions. Give the faster model a useful signal about where its approximation breaks down.</p><pre><code>prediction = student(system)\nreference = teacher(system)\nerror = compare(prediction, reference)</code></pre>"],
  ["An experiment that runs itself", "Closing the loop between a question, a measurement, and the next question.", "<h2 id=the-loop>The loop</h2><ol><li>Choose an experiment.</li><li>Make a measurement.</li><li>Update the model.</li><li>Choose again.</li></ol><p>The interesting part is the feedback between those steps.</p>"],
  ["Notes from the wet lab", "The gap between the beautiful diagram and the thing on the bench.", "<h2 id=the-bench>At the bench</h2><p>Every clean diagram hides a collection of practical decisions. This example includes a checklist.</p><ul><li><input type=checkbox disabled checked> Record the starting conditions</li><li><input type=checkbox disabled> Run the control</li><li><input type=checkbox disabled> Write down the surprise</li></ul>"],
  ["Build the smallest useful thing", "An argument for getting one complete loop working before adding the rest.", "<h2 id=one-loop>One complete loop</h2><p>A small system that answers a real question is a useful place to start. Pick the question, make the loop work, and keep the seams clear enough to change.</p><hr><p>The next experiment should tell you what to build next.</p>"],
  ["A map is not a cell", "Where our abstractions help, where they break, and what the failures can teach us.", "<h2 id=the-abstraction>The abstraction</h2><p>A map is useful because it leaves things out. Choosing what to leave out is a scientific decision.</p><table><thead><tr><th>Model</th><th>Question</th></tr></thead><tbody><tr><td>Simple</td><td>What matters most?</td></tr><tr><td>Detailed</td><td>What did we miss?</td></tr></tbody></table>"],
  ["In praise of strange ideas", "Make room for a hypothesis that sounds unreasonable, then find a way to test it.", "<h2 id=make-it-testable>Make it testable</h2><p>The useful move is to turn an ambitious idea into a small question with an observable answer.</p><p>This is example content for testing the blog layout.</p>"],
  ["What should we measure next?", "Uncertainty can be a guide to the next experiment.", "<h2 id=next-question>The next question</h2><p>If two explanations fit everything you have seen, look for the measurement where they disagree.</p><p><a href=\"https://github.com/tretikov-com/max.tretikov.com/discussions\">Continue the conversation on GitHub.</a></p>"],
  ["The cost of a measurement", "Every observation has a price. Which one gives you the most useful answer?", "<h2 id=choose-well>Choose well</h2><p>An example archive post for testing longer collections of writing.</p>"],
  ["Models need failure modes", "Understanding a model includes understanding where it stops being useful.", "<h2 id=boundaries>Find the boundaries</h2><p>Write down a prediction, a useful test, and what a surprising result would mean.</p>"],
  ["What survives the simplification", "A small model can still preserve the behavior that matters.", "<h2 id=keep-the-question>Keep the question</h2><p>This example checks the archive and post reader with a longer list of posts.</p>"],
  ["A notebook for unfinished ideas", "Some questions are worth keeping before they have an answer.", "<h2 id=keep-going>Keep going</h2><p>Sample content for local development. Nothing here creates a public GitHub post.</p>"],
];

export default examples.map(([title, excerpt, html], index) => ({
  number: 9001 + index,
  title,
  excerpt,
  html: `<p><em>Local development example. This is sample content for testing the site.</em></p><p>${excerpt}</p>${html}`,
  createdAt: new Date(Date.UTC(2026, 9, 18 - index * 2, 12)).toISOString(),
  updatedAt: "2026-10-18T12:00:00Z",
  readingMinutes: index % 4 + 2,
  url: DISCUSSIONS_URL,
  author: null,
  isDemo: true,
}));
