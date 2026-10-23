# kaareyesAiEditor

**Your personal AI video editor for travel vlogs, Reels, TikToks, and Shorts. You record, it edits.**

A free, open-source editor that runs inside your AI coding agent: Claude Code, Codex, Cursor,
Antigravity, Gemini CLI, GitHub Copilot, Windsurf, and others that support
[Agent Skills](https://agentskills.io).

Drop in a raw video and say **"edit this"**. You get back a cut, captioned edit with a hook,
motion graphics, and sound. Then give notes in plain words (English, Tagalog, Taglish), the
way you would to a human editor. Lasting notes become rules it follows on every future edit,
so it learns your style.

**Quick start:** [Setup](#setup-once) → [How to use it](#how-to-use-it) → [What you need](#what-you-need)

## Setup (once)

### One prompt

Open your agent in any folder (for example `claude` or `codex` in a terminal, or a new chat
in Cursor or Antigravity) and paste:

```text
Set up kaareyesAiEditor for me. Clone https://github.com/kaareyes/free247editor.git into my
Documents folder (install Git first if it is missing, after asking me). Then follow the
"start" steps in its skill, .agents/skills/kaareyesAiEditor/SKILL.md: run node setup.mjs from
that folder, install anything it reports missing after asking me, help me choose free
transcription (a Groq key, which you get for me if you have browser tools such as Claude in
Chrome, or local faster-whisper), open the test video, and walk me through style setup. When
you finish, tell me the full path of the inbox folder and remind me to open my agent in the
free247editor folder from now on.
```

From then on, open your agent in the `free247editor` folder so it finds the skill. The
Claude desktop app works too: in its Code tab, pick Local and the folder.

### Step by step

1. **Get it.** `git clone https://github.com/kaareyes/free247editor.git`, or use
   *Code > Download ZIP* on GitHub and unzip it.
2. **Open the folder in your agent.** In a terminal: `cd free247editor` then `claude` or
   `codex`. In Cursor, Antigravity, or Windsurf, open the folder as the workspace.
3. **Type `start`.** The agent checks your computer, installs what is missing (with your OK),
   renders a test video, and asks a few questions about your style.

## How to use it

Open your agent **in the `free247editor` folder** every time, then follow these steps.

1. **Drop your video in `inbox/`** (or drag it into the chat). Phone footage in `.MOV` or
   `.MP4` is fine; your original is never changed.
2. **Say `edit this`**, or `edit this <story> <30 seconds>` to set the story and length. The agent transcribes it, cuts dead air, adds captions, a hook,
   motion cards, and light sound effects in your style, then renders a draft.
3. **Watch the draft.** It opens automatically and is saved as `outbox/<name>-v1.mp4`.
4. **Give notes in plain words**, for example:
   - "faster" / "mas mabilis"
   - "bigger captions" / "palitan ang hook"
   - "sounds are too loud" / "remove the whoosh"
   - "always put captions above my head" (lasting notes are saved to `my-rules.md`)
5. **Say `approved` or `final`.** You get `outbox/<name>-final.mp4` at full quality.

Copy-paste prompts:

```text
edit this
```

**Forgot the steps? Type `[HOW]`** and the agent replies with this guide, step by step, with
blue markers (🟦). It does nothing else.

Tell it the **story** and the **length** you want. Format: `edit this <story> <length>`

```text
edit this <story> <30 seconds>
```

```text
edit this: day 1 in Bali, the tiny planet camera trick, 30 seconds
```

The story is what the video is about, in your own words. The length is the target duration.
The agent builds the hook, picks the best moments, and cuts to fit that length. If you leave
them out, it keeps your natural pacing and tells you what it chose.

```text
Edit the newest video in inbox. I'm a travel vlogger: keep it natural, show the place name
in the hook, add a card when I name a camera or gear, and cut the long pauses.
```

```text
Make a horizontal YouTube version of the approved video.
```

```text
New rule: never use music, only light sound effects.
```

To change your style later, say `change my style`. To start over, delete `my-style.md` and
type `start`.

Vertical 9:16 for Reels, TikTok, and Shorts by default. Ask for a horizontal version for
YouTube and it gets its own framing and text placement.

Tip for vlogs: shoot at the highest resolution your phone or camera allows. Low-resolution
clips are upscaled to 1080x1920 and look soft.

## What it does

| | |
| --- | --- |
| Cuts | Removes dead air, breaths, false starts, and retakes |
| Captions | Word by word, bold key words, key-word pills, or subtitles, in your position and colors |
| Hook | Big text in the first 3 seconds, if you want it |
| Motion graphics | Animated cards, pop-up clips, and overlays (HyperFrames + GSAP) |
| Camera | Zoom-ins and reframing that keep your face clear |
| Color | Natural, warm, cool, black and white, or orange and teal |
| Sound | Sound effects and a music bed from files you put in `my-sounds` |
| Learning | Your notes are saved as rules in `my-rules.md` and applied every time |

## What you need

- **An AI coding agent that can run terminal commands**, such as Claude Code (paid Claude
  plan; Pro works, Max is better if you edit often), Codex, Cursor, Antigravity, Gemini CLI,
  GitHub Copilot agent mode, or Windsurf. Editing uses a lot of usage. Codex blocks internet
  in its sandbox by default, so approve network access when setup or transcription asks.
- **Node.js 22+, Git, FFmpeg, and Chrome.** Setup tells you what is missing and the agent can
  install it for you.
- **Transcription, free either way:** a free [Groq](https://console.groq.com/keys) key
  (fast, best for Taglish), or [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
  on your own computer (`pip install faster-whisper`, needs Python).
- About 1 GB of disk space.

Tested on Windows 11 and macOS with Claude Code (setup, transcription, cuts, captions, and
draft renders). The other agents read the same standard files but are not tested yet. Linux
should work but is not tested.

On macOS, install tools with Homebrew (`brew install node ffmpeg git`). Setup prints the
exact command if something is missing.

## Costs

The software is free. You pay only for your agent's plan. Groq's free tier covers normal
use. The agent will never call a paid service (ElevenLabs, Kie.ai, or others) without asking.

## How each agent finds it

The whole editor is one skill, `.agents/skills/kaareyesAiEditor/SKILL.md`, in the shared
Agent Skills folder that Codex, Cursor, Antigravity, Gemini CLI, GitHub Copilot, Windsurf,
and OpenCode read. Claude Code reads skills only from `.claude/skills/`, so a short copy
there points to the same file. `AGENTS.md`, which `CLAUDE.md` imports, tells every agent to
use the skill. Edit only `.agents/skills/kaareyesAiEditor/SKILL.md`; if you change its
description, copy the new one into `.claude/skills/kaareyesAiEditor/SKILL.md` too.

## Not included

- An exported CapCut project. You get the MP4 plus the editable HyperFrames project in
  `kit/video-projects/<name>`; open it in HyperFrames Studio with `npx hyperframes preview`.
- Stock music or footage. Bring your own into `my-sounds` and `inbox`.
- Posting. It never uploads your videos anywhere.

## Folders

```
free247editor/
  .agents/skills/    the kaareyesAiEditor skill: how your agent runs the editor
  .claude/skills/    pointer to that skill for Claude Code
  AGENTS.md          tells every agent to use the skill (CLAUDE.md imports it)
  setup.mjs          one-time setup (safe to re-run)
  tools/             free transcription
  inbox/             your raw videos
  outbox/            drafts and finals
  my-style.md        your style (created at setup, stays private)
  my-rules.md        rules learned from your notes (stays private)
  my-sounds/         your music and sound effects
  kit/               the editing engine (installed by setup)
```

Your footage, renders, style, rules, and key are in `.gitignore` and never leave your computer.

## Updating the engine

Setup installs a pinned version of the engine. To move to a newer one, change `KIT_COMMIT` in
`setup.mjs`, move any projects you want to keep out of `kit/video-projects`, delete `kit/`, and
type `start` again. Your style, rules, inbox, and outbox are untouched.

## Credits

The editing engine is [Herk Edit Kit](https://github.com/nateherkai/herk-edit-kit) by
Nate Herk (MIT), built on [HyperFrames](https://github.com/heygen-com/hyperframes) and
[GSAP](https://gsap.com/). Setup downloads it from its own repository; it is not copied
here. The AI Automation Society brand assets inside that kit belong to their owner and are
not licensed for reuse.

kaareyesAiEditor is not affiliated with Nate Herk, HeyGen, or any of the AI agent makers.

## License

MIT. See [LICENSE](LICENSE).
