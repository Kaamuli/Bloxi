// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const OpenAI = require("openai");

const OPENAI_API_KEY = "INSERT UR KEY HERE";
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

app.post("/chat", async (req, res) => {
  const { token, user_input } = req.body;

  const prompt = `
You are a Simulink assistant. The user will describe a system, mathematical model, differential equation, or engineering idea in plain language. You must either ask a clarifying question OR return a Simulink model as valid JSON. Never both.

---

🧭 CLARIFICATION MODE:
If the user input is too vague or ambiguous, return only this structure:

{
  "type": "clarification",
  "reply": "Could you clarify what x represents in your equation?"
}

Do NOT include any blocks, connections, or layout when clarification is needed.

---

🏗 MODELLING MODE:
If the input is clear, return only valid JSON without markdown formatting in this format:

{
  "blocks": [
    {"type": "Gain", "name": "Gain_k", "value": "3"},
    {"type": "Sum", "name": "Sum1"},
    {"type": "Integrator", "name": "Int1"},
    {"type": "Scope", "name": "Scope1"}
  ],
  "connections": [
    {"src": "Gain_k/1", "dst": "Sum1/1"},
    {"src": "Sum1/1", "dst": "Int1/1"},
    {"src": "Int1/1", "dst": "Scope1/1"}
  ],
  "layout": {
    "Gain_k": [100, 100],
    "Sum1": [200, 100],
    "Int1": [300, 100],
    "Scope1": [400, 100]
  }
}

---

📐 MODELLING CONVENTIONS & RULES:

1. Differential Equations:
   - Use Integrator blocks for time-domain states.
   - Example: x'' + 3x' + 2x = 5sin(t) → requires two integrators to compute x' and x from acceleration input.
   - Causal chain: source → gain(s) → sum → integrator → integrator → output

2. Standard Block Types:
   - Use only standard Simulink library blocks: Gain, Sum, Integrator, Scope, Constant, Product, Sine Wave, Step, Transfer Fcn, etc.
   - Only use block types available in "Simulink/Commonly Used Blocks"

3. Block Naming:
   - Every block must have a unique, readable name: e.g. Gain_k, Integrator1, Sum1, Scope1

4. Parameters:
   - Provide "value" for Gain, Constant, Product
   - Provide "amplitude" and "frequency" for Sine Wave if needed
   - Provide "numerator" and "denominator" for Transfer Fcn (as strings or arrays)

5. Connections:
   - Use src/dst ports like "Gain1/1" to "Sum1/2"
   - Signal flows from left to right

6. Dynamic Variables:
   - Treat unknown variables like x, y, θ as system states unless otherwise stated
   - Model them with Integrators

7. Layout:
   - Use layout to position blocks visually
   - Each block should have a layout like "BlockName": [x, y]
   - Space blocks horizontally by at least 80 units to avoid overlap

---

🔧 ODE MODELING RULES (Automatically Apply These Conventions When an ODE Is Described):

1. Generic ODE → Integrator Chain
   - Whenever the user provides any equation of the form:
     dⁿx/dtⁿ + a_{n–1} d^{n–1}x/dt^{n–1} + … + a₀ x = Input(t),
     automatically build:
     a. A Sum block that combines Input(t) (positive) and each term a_{i}·x^{(i)} (with correct sign, usually negative for left‐side terms).
     b. A Gain block set to 1/a_{n} (unless a_{n} = 1) immediately after the Sum, to compute acceleration or highest‐order derivative.
     c. A series of n Integrator blocks:
        • The first Integrator’s output is x^{(n–1)}.
        • The second Integrator’s output is x^{(n–2)}, and so on, until x itself.

2. Feedback Paths & Gains
   - For each coefficient a_{i} (i < n), create a Gain block named logically (e.g., “Gain_damper” for a₁, “Gain_spring” for a₀) whose value = a_{i}.
   - Connect each Gain from the appropriate Integrator output back into a negative port on the Sum block.
   - The highest‐order term’s coefficient a_{n} is handled by the Gain immediately after the Sum (value = 1/a_{n}), not in feedback.

3. Signal Flow Direction
   - Always place the Sum block upstream of any Integrator blocks.
   - The Sum block’s output feeds into a Gain (1/a_{n}), then into the first Integrator.
   - Each Integrator output flows forward into the next Integrator and also backward through its Gain into the Sum.

4. Block Naming Conventions
   - Name Integrators to reflect their role (e.g., “Int_velocity,” “Int_displacement”) or simply “Integrator1,” “Integrator2” if roles aren’t explicitly given.
   - Name Gains by their physical meaning: “Gain_mass,” “Gain_damper,” “Gain_spring,” “Gain_inertia,” etc.
   - Name the Sum block “SumForces” or “SumTerms” to clarify its purpose.
   - Use “In1” or “ForceInput” for an external force or input signal.
   - Use “Scope” with a numeric suffix (e.g., “Scope1”) to display outputs.

5. Parameters & Block Configuration
   - For Gain blocks: set “value” = coefficient as a string (e.g., "2" or "-3").
   - For Sine Wave blocks (if used as an input): set “amplitude” and “frequency” as strings.
   - For Transfer Fcn blocks: set “numerator” and “denominator” (as comma-separated strings or arrays).
   - For Integrator blocks: use default settings (they integrate the input automatically).

6. Example: x'' + 3x' + 2x = 5sin(t)
   - In1 block named “ForceInput” provides 5sin(t).
   - Sum block “SumForces” has three inputs:
     • Port 1 (positive): ForceInput/1
     • Port 2 (negative): Gain_damper/1 (value = 3)
     • Port 3 (negative): Gain_spring/1 (value = 2)
   - SumForces output → Gain_mass (value = 1/1) → Integrator1 (“Int_velocity”) → Integrator2 (“Int_displacement”) → Scope1.
   - Feedback:
     • Int_velocity/1 → Gain_damper/1 → SumForces/2
     • Int_displacement/1 → Gain_spring/1 → SumForces/3

7. Electrical or Other Standard ODE Systems
   - For RLC circuits or other ODE-based systems, apply the same pattern: Sum currents/voltages, divide by inductance/capacitance, chain Integrators, feed back through Gains for resistances, capacitances, etc.

8. Layout Recommendations
   - Always include a “layout” field mapping each block’s name to screen coordinates [x, y].
   - Maintain a minimum 80-pixel horizontal separation between sequential blocks to avoid overlap.
   - Place feedback Gains above or below the main Integrator chain, connecting back to the Sum block.

9. HANDLING RIGHT-HAND-SIDE FORCING (e.g. A·sin(t), A·step(t), constants):
   - If the equation has a forcing term of the form A·sin(t), create a Simulink “Sine Wave” block named logically (e.g. "Sine1") with:
     •   "amplitude": A (as a string)
     •   "frequency": "1"
     •   default other parameters (phase = 0, sample time = 0)
   - Connect that Sine Wave’s output into the positive port of the Sum block (the first “+” port).
   - If the forcing is a constant (e.g. “= C”), create a “Constant” block with value = C and connect it to the Sum block’s positive port.
   - If the user explicitly writes “5·step(t)” or “A·step(t)”, create a “Step” block with “Step time = 0”, “Initial value = 0”, “Final value = A” and connect to the Sum block.

10. PORT-COUNT ANNOTATIONS (for multi-input/multi-output blocks):
   - **Sum blocks**: If you include more than two signals in a Sum, add an "inputs" field whose value is a string of plus/minus signs.
     • For example, if you have three positive terms and one negative term, write "inputs": "+++-".
     • GPT should then output Sum blocks like:
       {
         "type": "Sum",
         "name": "SumForces",
         "inputs": "+++-"
       }
   - **Scope blocks**: If you plan to feed K signals to a Scope, add "numInputs": K.
     • For instance, two signals → "numInputs": 2.
     • GPT should then output Scope blocks like:
       {
         "type": "Scope",
         "name": "Scope1",
         "numInputs": 2
       }
   - Your MATLAB builder will call set_param(..., 'Inputs', "...") for Sum and set_param(..., 'NumInputPorts', "...") for Scope, so that Simulink actually creates the correct number of ports.
   
---

👤 USER INPUT:
${user_input}
`;

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You convert user input into Simulink JSON OR ask a follow-up question. Never mix.`,
        },
        { role: "user", content: prompt },
      ],
    });

    const text = chat.choices[0].message.content.trim();

    let model_data = {};
    let responseType = "clarification";
    let actualReply = text;

    // Try parsing the entire response as raw JSON
    try {
      const parsed = JSON.parse(text);

      if (parsed.type === "clarification" && typeof parsed.reply === "string") {
        // GPT is asking a follow-up
        responseType = "clarification";
        actualReply = parsed.reply;
        model_data = {};
      } else if (parsed.blocks || parsed.connections) {
        // GPT returned a model if success
        responseType = "model";
        model_data = parsed;
        actualReply = "Here is your Bloxi model.";
      } else {
        // Some other JSON structure: Clarification
        responseType = "clarification";
        actualReply = text;
        model_data = {};
      }
    } catch (err) {
      // If invalid JSON
      responseType = "clarification";
      actualReply = text;
      model_data = {};
    }

    res.json({
      reply: actualReply,
      model_data,
      type: responseType,
    });
  } catch (error) {
    console.error("OpenAI error:", error.message);
    res.status(500).json({ reply: "[⚠️ OpenAI API error]", type: "error" });
  }
});

app.post("/debug", async (req, res) => {
  const { token, problem, debug_img } = req.body;

  if (!debug_img || !problem) {
    return res
      .status(400)
      .json({ reply: "Both 'problem' and 'debug_img' are required." });
  }

  // Prompt w/problem + base64 screenshot innit
  const prompt = `You’re a Simulink-savvy engineer helping a peer debug a model. They wrote:
"${problem}"

You have a base64-encoded PNG of their model below.

Your job is to:
1. Spot the most likely *single* issue based on what you see.
2. Give a practical fix or suggestion.
3. Optionally, add a one-liner tip.

Do not write a list. Do not format your reply like a blog post. No markdown, no headings, no bullets.

Write like you’re talking to a colleague sitting next to you. Sound natural. One paragraph, short and clear. No fluff.

Only ask for clarification if you genuinely can’t see enough in the diagram.


Choose one of:

Feedback:
{
  "type": "feedback",
  "reply": "Your m_total value looks off — it might be missing the cable mass. Double-check how it's being summed. Also, make sure you're not accidentally dividing by zero in the accel block."
}


If requesting clarification:
{
  "type": "clarification",
  "reply": "Could you provide more detail about <something>?"
}
`;

  try {
    //Send request
    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 400,
      messages: [
        { role: "system", content: "You are a Simulink debugging assistant." },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Problem: ${problem}\nGive concrete Simulink debug advice.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${debug_img}` },
            },
          ],
        },
      ],
    });

    // **2) Parse the JSON reply**
    const text = chat.choices[0].message.content.trim();
    let responseType = "feedback";
    let debugReply = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed.type === "clarification") {
        responseType = "clarification";
        debugReply = parsed.reply;
      } else if (parsed.type === "feedback") {
        debugReply = parsed.reply;
      }
    } catch (parseErr) {}

    res.json({ type: responseType, reply: debugReply });
  } catch (error) {
    console.error("Debug OpenAI error:", error.message);
    res.status(500).json({ reply: "[⚠️ Debug OpenAI API error]" });
  }
});

app.listen(3000, () => {
  console.log("✅ Bloxi backend running at http://localhost:3000");
});
