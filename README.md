Before I start - Yes, I know the differential equation in the video is wrong. I’ve already fixed it by tweaking the prompt and the script so the inputs depend on what’s being asked. The original issue was that blocks like Sum were being pasted in without matching the right number of inputs and outputs.

I’m a 2nd-year aero-engineering student at Imperial College London, I enjoy problem solving (did BPhO - gold and UKMT Gold) I'm a full-stack dev (or atleast trying to be lol) who hacked together Bloxi, an AI copilot that sits on top of Simulink and turns plain-English prompts into working control-system models and can easily debug them in real time. I felt the pain myself this term, watching top-tier students burn hours wiring blocks instead of engineering. With today’s multimodal LLMs finally able to “see” diagrams, this is the first moment an assistant like Bloxi can exist and the fastest way to give millions of engineers the same productivity leap coders just got.I built this mainly to get comfortable with LLMs and “prompt-engineering,” and I think I’ve hit the point where I’m done tinkering—especially now that MathWorks have announced they’re working on their own version. So I figured I’d share what I’ve got in case anyone wants to take it further and also just to like give it out to the world innit.

How it works:

Two scripts + simple backend (3):

1. One builds the Simulink model.

2. The other handles the chat + simple UI.

3. Backend that glues together the OpenAI API and frontend

Drop in your own OpenAI API key and you’re off. I used it to debug and build a few uni-project models, and it’s been surprisingly handy.

At first it just spat out a finished Simulink file, but I wanted that ChatGPT “walk-through” vibe make it feel 'magical'. So I added a couple of for loops: one to drop in blocks step-by-step, and another to wire them up.

Since raw code isn’t visible in Simulink (to the best of my knowledge), within one of my scripts I had it walk through the simulink file and screenshot each stage leveraging the fact openAI's API is multimodal, pipe them through the LLM, and let it spot inconsistencies. Works better than I expected. Perhaps someone can do better or find a better way?

Youtube video of me using it is https://youtu.be/TX0fviaFSyg

To use download & open scripts then just do openChatbox().
