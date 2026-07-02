# CareerOS — Design Specification for Stitch
**AI-Powered Career Intelligence Platform**
*Complete UI/UX Design Brief — June 2026*

---

## 1. Brand Identity

### 1.1 Brand Concept
CareerOS is where ambitious Indian students come to become hireable. The brand feeling is: **"Your smartest friend who works in tech and genuinely wants to help you get there."** Intelligent, warm, slightly gamified — not corporate, not casual. Think Notion meets Duolingo meets Linear.

### 1.2 Logo Mark
- Wordmark: **CareerOS** in a geometric sans-serif
- Icon: Abstract stylized upward path/roadmap inside a soft square rounded-rectangle
- Tag: "Your AI Career Co-pilot"
- Avoid: graduation caps, briefcases, any cliché career imagery

### 1.3 Color Palette

```
PRIMARY COLORS
──────────────────────────────────────────────────
Indigo-600      #4F46E5    Primary brand, CTAs, active states
Violet-600      #7C3AED    Secondary, gradients, premium features
Cyan-500        #06B6D4    Accent, highlights, progress indicators

BACKGROUND SCALE
──────────────────────────────────────────────────
Indigo-950      #1E1B4B    Dark mode base background
Gray-950        #030712    Dark mode surface deep
Gray-900        #111827    Dark mode card background
Gray-800        #1F2937    Dark mode elevated card
White           #FFFFFF    Light mode base
Gray-50         #F9FAFB    Light mode surface
Gray-100        #F3F4F6    Light mode card background

SEMANTIC COLORS
──────────────────────────────────────────────────
Green-500       #10B981    Success, completed, strong score
Amber-500       #F59E0B    Warning, medium score, pending
Red-500         #EF4444    Error, low score, critical gap
```

### 1.4 Typography

```
TYPEFACE STACK
──────────────────────────────────────────────────
Display:    Inter, -apple-system, sans-serif
Code/Mono:  JetBrains Mono, Fira Code, monospace

SCALE (use Tailwind classes)
──────────────────────────────────────────────────
text-5xl / font-bold      Hero headlines (48px)
text-4xl / font-bold      Page titles (36px)
text-3xl / font-semibold  Section headers (30px)
text-2xl / font-semibold  Card titles (24px)
text-xl  / font-medium    Subheadings (20px)
text-base                 Body copy (16px)
text-sm                   Secondary text (14px)
text-xs                   Labels, captions (12px)
```

### 1.5 Spacing & Border Radius

```
Spacing scale:    4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px
Border radius:    rounded-xl (12px) for cards, rounded-2xl (16px) for modals,
                  rounded-full for badges/tags, rounded-lg for inputs
Shadows:          shadow-lg for cards, shadow-xl for modals, 
                  custom glow for premium features: 
                  box-shadow: 0 0 0 1px rgba(79,70,229,0.3), 0 4px 24px rgba(79,70,229,0.15)
```

---

## 2. Design System Components

### 2.1 Buttons

```
PRIMARY BUTTON
  bg-indigo-600 hover:bg-indigo-700 text-white font-semibold
  px-6 py-2.5 rounded-xl transition-all
  Active: scale-[0.98]
  Disabled: opacity-50 cursor-not-allowed

SECONDARY BUTTON  
  border border-indigo-500 text-indigo-400 hover:bg-indigo-950
  px-6 py-2.5 rounded-xl

GHOST BUTTON
  text-gray-400 hover:text-white hover:bg-gray-800 px-4 py-2 rounded-lg

GRADIENT CTA (Premium / Hero)
  bg-gradient-to-r from-indigo-600 to-violet-600 text-white
  px-8 py-3 rounded-xl font-bold shadow-lg
  hover: from-indigo-500 to-violet-500
  
DANGER BUTTON
  bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl
```

### 2.2 Cards

```
BASE CARD
  bg-gray-900 border border-gray-800 rounded-2xl p-6
  
ELEVATED CARD (for important metrics)
  bg-gray-900 border border-gray-700 rounded-2xl p-6
  shadow: 0 4px 24px rgba(0,0,0,0.4)

SCORE CARD (for career score dims)
  bg-gray-900 border border-gray-800 rounded-xl p-4
  Left accent bar: w-1 rounded-full bg-[statusColor] 
  
PREMIUM GLOW CARD
  bg-gray-900 border border-violet-500/30 rounded-2xl p-6
  box-shadow: 0 0 0 1px rgba(124,58,237,0.3), 0 8px 32px rgba(124,58,237,0.1)
  
GLASS CARD (Landing page only)
  backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6
```

### 2.3 Badges & Tags

```
SKILL TAG
  bg-indigo-950 text-indigo-300 border border-indigo-800 
  px-3 py-1 rounded-full text-xs font-medium
  
PRIORITY TAG
  P0: bg-red-950 text-red-300 border-red-800
  P1: bg-amber-950 text-amber-300 border-amber-800  
  P2: bg-green-950 text-green-300 border-green-800

PLAN BADGE
  Free: bg-gray-800 text-gray-300
  Premium: bg-violet-950 text-violet-300
  Pro: bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold

STATUS INDICATOR
  Active: w-2 h-2 rounded-full bg-green-400 (with pulse animation)
  Processing: w-2 h-2 rounded-full bg-amber-400 animate-pulse
  Error: w-2 h-2 rounded-full bg-red-400
```

### 2.4 Form Elements

```
INPUT FIELD
  bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5
  text-white placeholder:text-gray-500
  focus: border-indigo-500 ring-2 ring-indigo-500/20 outline-none
  
SEARCH INPUT
  Same as above with search icon left-padded (pl-10)

SELECT / DROPDOWN
  Same as input; custom dropdown with dark bg-gray-800 options
  
MULTI-SELECT CHIPS
  Display: flex flex-wrap gap-2
  Selected chip: bg-indigo-600 text-white px-3 py-1 rounded-full
  Remove X on each chip
  
CAREER GOAL SELECTOR (custom)
  Grid of cards: 3 columns on desktop, 2 on mobile
  Each card: bg-gray-800 border-2 border-transparent rounded-xl p-4
  Selected: border-indigo-500 bg-indigo-950/50
  Icon + Label on each card

FILE UPLOAD ZONE
  Border-2 border-dashed border-gray-700 rounded-2xl p-12
  Hover: border-indigo-500 bg-indigo-950/20
  Icon (upload arrow) centered, instructions below
  Drag-active state: scale-[1.01] border-indigo-400 bg-indigo-950/30
```

### 2.5 Score Visualization

```
RADIAL SCORE CHART
  Large circle (220px diameter), dark stroke bg (stroke-gray-800)
  Animated fill stroke (stroke-indigo-500 or status color)
  Score number in center: text-4xl font-bold
  Label below: text-sm text-gray-400
  
DIMENSION PROGRESS BAR
  Label left, score right
  Full-width bar: bg-gray-800 rounded-full h-2
  Fill: rounded-full transition-all duration-1000
  Color: green (70+), amber (50-69), red (<50)

MINI SPARKLINE (for history)
  Simple SVG line chart, 4px stroke, indigo-500 color
  No axes, just the trend curve
  Gradient fill below curve: indigo → transparent
```

---

## 3. Screen Designs — Detailed Specifications

---

### SCREEN 1: Landing Page (/)

**Layout:** Single-page scroll. Dark background. Sections flow top to bottom.

**Section 1 — Hero**
```
Background: bg-gray-950 with subtle radial gradient:
  radial-gradient(ellipse at 50% 0%, rgba(79,70,229,0.15) 0%, transparent 60%)
  
Navbar:
  - bg-gray-950/80 backdrop-blur-md sticky top-0 z-50
  - Left: CareerOS logo (wordmark)
  - Center: Nav links: Features | Pricing | For Colleges | Blog
  - Right: "Log In" (ghost button) + "Get Started Free" (primary button)

Hero Content (centered, max-w-4xl mx-auto):
  Eyebrow: small badge "Now with AI Mentor →" (gradient border badge)
  H1: "From College to Career, Faster."  (text-6xl font-bold, white)
  Subheading: "CareerOS analyzes your resume, maps your gaps, and builds your 
  personalized learning roadmap — so you know exactly what to learn next."
  (text-xl text-gray-400 max-w-2xl)
  
  CTA Buttons (row, centered):
    "Get Your Free Career Score" — gradient button, large
    "Watch Demo (2 min)" — ghost button with play icon

  Social Proof Strip: 
    "Trusted by 5,000+ students from IIT, NIT, BITS and 200+ colleges"
    Row of college logos (grayscale)

Hero Visual:
  Dashboard mockup screenshot / illustration floating below CTA
  Subtle shadow + indigo glow underneath
  Background decorative: gradient orbs (indigo + violet, blur-3xl, opacity-20)
```

**Section 2 — Social Proof Numbers**
```
bg-gray-900 py-16
4-column grid:
  "10,000+" / "Resumes Analyzed"
  "2,300+" / "Students Placed"  
  "4.8★" / "App Rating"
  "47%" / "Avg Score Improvement"

Each number: text-4xl font-bold text-indigo-400
Label: text-sm text-gray-500 uppercase tracking-wider
```

**Section 3 — How It Works (Steps)**
```
py-24 max-w-6xl mx-auto

Header: "Your 10-Step Career Journey" (h2, centered)

Steps displayed as: vertical timeline on mobile, horizontal numbered flow on desktop

Each step card:
  Number badge: w-10 h-10 rounded-full bg-indigo-600 text-white centered
  Icon: relevant Lucide icon
  Title: text-xl font-semibold
  Description: text-gray-400 text-sm

Steps:
1. Onboarding → 2. Resume Upload → 3. Career Score → 4. Gap Analysis →
5. Roadmap → 6. AI Mentor → 7. Progress → 8. Job Match → 9. Mock Interview → 10. Offer Ready
```

**Section 4 — Feature Deep Dive (alternating)**
```
3 alternating sections (text left / visual right, then flip):

1. "Know Exactly Where You Stand"
   Visual: Career Score breakdown UI (screenshot)
   
2. "Your Personalized Roadmap, Not a Generic One"
   Visual: Roadmap month-cards UI
   
3. "An AI Mentor That Actually Knows You"
   Visual: AI Chat interface mockup

Each section:
  py-20 max-w-6xl mx-auto grid grid-cols-2 gap-16 items-center
  Text side: badge + h2 + body + CTA link
  Visual side: glass card with UI screenshot, indigo glow
```

**Section 5 — Pricing**
```
py-24 bg-gray-900

Header: "Simple, Student-First Pricing" (centered h2)

3-column grid (Free / Student Premium / Pro Premium):

FREE card (bg-gray-800):
  "Free Forever" badge
  ₹0 / month
  Features list with checkmarks

STUDENT PREMIUM card (indigo glow):
  "Most Popular" badge (violet)
  ₹149/month (₹1,499/year billed annually — save 17%)
  Features list

PRO PREMIUM card (gradient border):
  "Best Value" badge
  ₹399/month
  All features

Each card: px-8 py-10 rounded-2xl
CTA: "Get Started" / "Start Free Trial" / "Go Pro"

Annual toggle: "Monthly | Annual (Save 17%)" pill toggle above cards
```

**Section 6 — Testimonials**
```
py-20 bg-gray-950

Header: "Students Who Made It" (centered)

Grid of 3 testimonial cards (glass cards):
  Quote text (italic, text-gray-300)
  Avatar + Name + College + Placement (e.g., "Placed at Zomato")
  Company logo (small, grayscale)
```

**Section 7 — For Colleges (B2B teaser)**
```
py-20 bg-gradient-to-br from-indigo-950 to-violet-950

Split layout: text left, dashboard mockup right
"Improve Your Batch Placement Rate by 35%"
Body copy about TPO dashboard
CTA: "Request a Demo" (white button)
```

**Section 8 — Footer**
```
bg-gray-950 border-t border-gray-800 py-12

Grid: Logo+tagline | Product links | Company links | Socials
Bottom bar: Copyright | Privacy Policy | Terms of Service
```

---

### SCREEN 2: Sign Up Page (/signup)

```
Layout: Split screen — 60% left visual panel, 40% right form panel

LEFT PANEL:
  bg-gradient-to-br from-indigo-900 to-violet-900
  Large testimonial quote from a placed student
  Floating score card mockup
  "Join 10,000+ students building their career"

RIGHT PANEL:
  bg-gray-950 flex items-center justify-center
  
  FORM CARD (max-w-sm w-full):
    Logo top center
    H1: "Create your account" (text-2xl font-bold text-white)
    
    Google OAuth button: 
      bg-white text-gray-900 border rounded-xl py-2.5 w-full
      Google icon + "Continue with Google"
    
    Divider: "or sign up with email"
    
    Fields:
      Full Name (text input)
      Email Address (email input)
      Password (password input with show/hide toggle)
    
    Terms checkbox:
      "I agree to the Terms of Service and Privacy Policy"
    
    CTA: "Create Free Account" (gradient button, full width)
    
    Footer: "Already have an account? Log in →"
```

---

### SCREEN 3: Onboarding Wizard (/onboarding)

```
Layout: Centered card on dark bg, max-w-2xl

PROGRESS INDICATOR (top):
  5 circles connected by lines
  Completed: filled indigo circle with checkmark
  Current: indigo ring with number
  Upcoming: gray ring with number
  Step label below each circle

STEP 1 — Personal Details
  H2: "Let's set up your profile"
  Subtext: "This helps us personalize everything for you"
  
  Fields in 2-column grid:
    Full Name (full width)
    College (full width, autocomplete dropdown)
    Degree (select: B.Tech / M.Tech / BCA / MCA / BSc CS)
    Graduation Year (select: 2024 / 2025 / 2026 / 2027)

STEP 2 — Career Goals
  H2: "What's your target role?"
  Subtext: "Select all that apply"
  
  3-col grid of goal cards (48px icon + label):
    💻 Software Engineer (SDE)
    📊 Data Scientist
    🤖 AI/ML Engineer
    🚀 DevOps / SRE
    📱 Product Manager
    🎨 UI/UX Designer

STEP 3 — Preferences
  H2: "Your work preferences"
  
  Work Mode (horizontal pill selector):
    [Remote] [Hybrid] [Onsite]
  
  Company Type (multi-select chip grid):
    FAANG | Product Companies | Unicorns | Startups | Service Companies
  
  Target Companies (tag input):
    "Type a company and press Enter"
    Shows tags: Google × Amazon × Microsoft ×

STEP 4 — Skill Level
  H2: "How would you rate yourself?"
  
  3 large cards (horizontal on desktop, stacked on mobile):
    BEGINNER
    Icon: seedling
    "< 6 months coding, learning basics"
    Bullet: No projects yet | Learning DSA
    
    INTERMEDIATE  
    Icon: growing plant
    "1-2 projects, know 1-2 languages"
    Bullet: Basic DSA | Some frontend/backend experience
    
    ADVANCED
    Icon: tree
    "3+ projects, internship or freelance"
    Bullet: Strong DSA | System design basics
    
  Selected card: border-2 border-indigo-500, bg-indigo-950/50, indigo checkmark badge top-right

STEP 5 — Resume Upload
  H2: "Upload your resume for instant analysis"
  Subtext: "PDF or DOCX • Max 5MB • 1-3 pages"
  
  Large dropzone (dashed border, centered icon and text)
  Upload tips below:
    ✓ Clean single-column format works best
    ✓ Include GitHub and LinkedIn links
    ✓ Quantify your project impact
  
  "Skip for now →" link (ghost, bottom right)

NAVIGATION:
  Bottom of each step: "Back" (ghost) + "Continue →" (primary)
  Step 5: "Continue →" → "Finish & See My Score"
```

---

### SCREEN 4: Main Dashboard (/dashboard)

```
Layout:
  Left: Sidebar (fixed, 256px wide)
  Right: Main content (flex-1, scrollable)

SIDEBAR:
  Top: Logo + "Beta" badge
  User avatar + Name + College (mini profile)
  
  Nav items (with Lucide icons):
    🏠 Dashboard (active)
    📊 Career Score
    🗺️ My Roadmap
    🔍 Gap Analysis
    💬 AI Mentor
    📄 Resume
    🎯 Mock Interviews
    💼 Job Matching   [LOCKED icon if not unlocked]
    📈 Progress
    ⚙️ Settings
  
  Bottom: 
    Plan badge (Free/Premium/Pro)
    "Upgrade to Pro ↗" (gradient text CTA)

MAIN CONTENT AREA:

  HEADER ROW:
    "Good morning, Rohan 👋"
    Date + "Day 7 streak 🔥" badge
    Quick actions: Upload Resume | Ask Mentor

  SCORE HERO CARD (full width):
    bg-gradient-to-br from-indigo-950 to-violet-950
    border border-indigo-500/30, rounded-2xl p-8
    
    Left: Large radial chart (Overall Score: 72)
    Right: 6 dimension bars:
      Resume Quality      ████████░░  80
      ATS Compatibility   █████████░  85
      Projects            ██████░░░░  65
      Experience          ████░░░░░░  40
      Interview Readiness █████░░░░░  55
      Market Position     ██████░░░░  60
    
    Bottom right: "Improve your score →" (indigo link)

  STATS ROW (4 cards):
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ 📈 Score     │ │ 🔥 Streak    │ │ ✅ Skills    │ │ 🎯 Interviews│
    │    72/100    │ │   7 Days     │ │   3/12 Done  │ │   2 Sessions │
    └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

  ROADMAP PREVIEW (card):
    "This Month's Focus" header + "View Full Roadmap →"
    Current month: "Month 1: Docker & Containers"
    Progress: 2/5 topics completed (progress bar)
    Next 3 topics listed with checkboxes
    
  BOTTOM ROW (2 columns):
    
    LEFT: "Skill Gaps to Address" (list)
    Top 4 missing skills with importance and time badges:
      Docker            Critical  ~2 weeks
      CI/CD Basics      High      ~3 weeks  
      Unit Testing      High      ~1 week
      System Design     Critical  ~6 weeks
    
    RIGHT: "AI Mentor" quick chat
    Last conversation snippet
    Quick prompt chips: "Why am I rejected?" | "Review my project"
    Input bar with Send button
```

---

### SCREEN 5: Career Score Page (/dashboard/score)

```
HEADER:
  "Career Score Analysis"
  Last updated: "June 7, 2026 — Recalculate →"

OVERALL SCORE HERO:
  Centered large radial chart (300px), animated fill
  Score: 72 (text-6xl font-bold)
  Color-coded ring: amber (50-69 range = amber, this is 72 = green)
  Below: "Good — You're above average for your target role"

SCORE HISTORY GRAPH (full width card):
  Line chart showing score over 8 weeks
  Indigo line with gradient fill, smooth curve
  Data points clickable to see what changed

6 DIMENSION DETAIL CARDS (2-col grid):
  Each card (rounded-2xl, bg-gray-900):
    Header: Icon + Dimension Name + Score badge (e.g., 80/100)
    Visual: Horizontal progress bar (colored by score level)
    Body: 2-3 specific observations
    Action: "How to improve →" link

  Example — ATS Compatibility Card:
    📋 ATS Compatibility  [85/100 — Strong]
    ████████████████░░░░  85%
    "Your keywords match well for SDE-1 roles"
    ✓ Strong: React, Node.js, SQL keywords present
    ✗ Missing: Docker, Kubernetes, System Design terms
    → "Add these keywords to your resume"
  
IMPROVEMENT SUGGESTIONS (card):
  H3: "Top Actions to Improve Your Score"
  Numbered list with impact badge:
    1. [+8 pts] Add a system design section to resume
    2. [+5 pts] Quantify project impact with metrics
    3. [+4 pts] Add GitHub link to header
    4. [+3 pts] Include Docker in skills section
```

---

### SCREEN 6: Gap Analysis (/dashboard/gaps)

```
HEADER: "Gap Analysis"
Subtitle: "Current State → Target State"

STATE COMPARISON (2 cards, arrow between):
  CURRENT STATE card:
    bg-gray-900 border border-amber-500/30 rounded-2xl p-6
    "Frontend Developer"
    Skills cloud: React, JavaScript, CSS, HTML, REST APIs...
    
  ──── "Your Gap" ────→
  
  TARGET STATE card:
    bg-gray-900 border border-indigo-500/30 rounded-2xl p-6
    "SDE-1 at Product Company"
    Required: React, Node.js, Docker, CI/CD, System Design, Testing...

MISSING SKILLS (full-width section):
  H3: "Skills You Need to Develop"
  Filter tabs: All | Critical | High | Medium | Low
  
  Table / card list:
    ┌─────────────────┬──────────┬──────────┬──────────────┐
    │ Skill           │ Priority │ Mkt Need │ Est. Time    │
    ├─────────────────┼──────────┼──────────┼──────────────┤
    │ 🐳 Docker       │ CRITICAL │  88%     │ ~2 weeks     │
    │ 🔄 CI/CD        │ CRITICAL │  82%     │ ~3 weeks     │
    │ 🧪 Unit Testing │ HIGH     │  79%     │ ~1 week      │
    │ 🏗️ System Design│ CRITICAL │  91%     │ ~6 weeks     │
    │ ☁️ AWS Basics   │ HIGH     │  74%     │ ~3 weeks     │
    └─────────────────┴──────────┴──────────┴──────────────┘
  
  "Add to Roadmap" button on each row
  "Add All Critical Skills to Roadmap" (bulk CTA, bottom)
```

---

### SCREEN 7: Personalized Roadmap (/dashboard/roadmap)

```
HEADER:
  "Your Personalized Roadmap"
  For: "SDE-1 at Product Company"
  Timeline: "June 2026 → December 2026"
  "Regenerate Roadmap" (ghost button)

TIMELINE VIEW (scrollable horizontal on desktop):
  Months as large cards left-to-right
  Current month: elevated + highlighted

MONTH CARD (expanded — current month):
  bg-gray-900 border-2 border-indigo-500 rounded-2xl p-6
  
  Header:
    "Month 1" badge (indigo)
    "DOCKER & CONTAINERIZATION" (h3)
    Progress: 2/5 topics [████░░░░░░ 40%]
  
  Topics list (each with checkbox):
    ☑ Docker fundamentals — Install, run containers
    ☑ Dockerfile writing — Best practices  
    ☐ Docker Compose — Multi-container apps
    ☐ Docker networking — Bridge, host modes
    ☐ Pushing to Docker Hub — Registry basics
  
  Resources section:
    DOCS: "Official Docker Docs" → link
    VIDEO: "Docker in 1 Hour — TechWorld" → YouTube link
    COURSE: "Docker & Kubernetes: Complete Guide" → Udemy (affiliate)
  
  Project Assignment:
    🚀 "Containerize your existing Node.js project with Docker + 
    docker-compose (Nginx + App + PostgreSQL)"
    
    Difficulty: Medium | Est: 8-10 hours
    "Mark as Complete" button (green, full width)

MONTH CARD (upcoming months — collapsed):
  bg-gray-900 border border-gray-800 rounded-xl p-4
  Smaller, just title + topic count + expand arrow
  
MONTH 2: Testing (Unit, Integration, E2E)
MONTH 3: System Design Fundamentals
MONTH 4: CI/CD with GitHub Actions
MONTH 5: Cloud Basics (AWS S3, EC2, Lambda)
MONTH 6: DSA — Graphs, DP (interview prep)

SIDEBAR (right): 
  "Roadmap Stats"
  Completion: 2/30 topics
  Est. completion: December 2026
  Export PDF button
```

---

### SCREEN 8: AI Mentor (/mentor)

```
Layout: Full height chat interface (like ChatGPT)

LEFT PANEL (Conversation History, 256px):
  "Previous Chats" header
  List of past conversations (title + date)
  "New Chat +" button top

MAIN CHAT AREA:
  HEADER (sticky):
    "AI Mentor" title
    Usage counter: "72 / 100 messages today" (amber text if low)
    "Pro: Unlimited →" upgrade link
  
  EMPTY STATE (when no messages):
    CareerOS logo icon, pulsing
    "Hi Rohan, I'm your AI Career Mentor."
    "I know your resume, your goals, and your gaps. Ask me anything."
    
    SUGGESTED PROMPTS (6 chips, 3x2 grid):
      "Why am I getting rejected?"
      "Review my latest project"
      "Generate SDE-1 interview questions"
      "Which companies should I target now?"
      "Rate my GitHub profile"
      "Write a cold DM for Flipkart"
  
  MESSAGES AREA (scrollable):
    User bubble: right-aligned, bg-indigo-600, rounded-2xl
    AI bubble: left-aligned, bg-gray-800, rounded-2xl
    AI messages support Markdown rendering (code blocks, lists, bold)
    Code blocks: bg-gray-950 border border-gray-700 rounded-lg, syntax highlighted
    Streaming: typing cursor animation while AI is responding
    
  INPUT BAR (sticky bottom):
    bg-gray-900 border border-gray-700 rounded-2xl
    Textarea (auto-resize, max 4 rows)
    Attach button (left icon)
    Send button (right, indigo, disabled when empty)
    "⌘+Enter to send" hint
```

---

### SCREEN 9: Resume Analyzer (/resume)

```
TWO-PANEL LAYOUT (desktop):
  LEFT: Resume upload + viewer (40%)
  RIGHT: Analysis results (60%)

LEFT PANEL:
  UPLOAD ZONE (if no resume):
    Large dropzone with upload icon
    "Drag & drop your resume (PDF or DOCX)"
    "Or click to browse"
    Accepted formats chip
  
  RESUME PREVIEW (after upload):
    iframe or PDF viewer of uploaded resume
    "Replace Resume" button bottom

RIGHT PANEL — ANALYSIS RESULTS:
  TABS: Overview | Skills Extracted | Improvements

  OVERVIEW TAB:
    ATS Score header: "Overall ATS Score: 78/100"
    6 dimension bars (same as dashboard but larger)
    
    PARSED DATA CARDS (3-col grid):
      Skills Found (count): React, Node.js, SQL...
      Projects (count): 2 projects
      Experience (count): 1 internship
      Education: B.Tech CSE, NIT
      Certifications: 0
      Contact Info: ✓ Complete
  
  SKILLS EXTRACTED TAB:
    Grouped by category:
      LANGUAGES: JavaScript, Python, C++
      FRAMEWORKS: React, Express, Flask  
      DATABASES: PostgreSQL, MongoDB
      TOOLS: Git, VS Code
    
    "Missing for SDE-1:" section below
    (skills shown with + Add to Roadmap)
  
  IMPROVEMENTS TAB:
    Numbered list of AI suggestions:
      1. [+8 pts] "Add quantified impact to your Zomato clone project"
         Current: "Built a food delivery app"
         Suggested: "Built a food delivery app serving 500+ mock users, 
         handling 50 concurrent orders with <200ms API response"
      2. [+5 pts] "Add Docker to skills — it's required in 88% of target JDs"
      ...

  "Download AI-Improved Resume" (Pro feature, locked for Free)
```

---

### SCREEN 10: Mock Interview (/interview)

```
LANDING STATE:
  H1: "Mock Interview"
  3 mode cards (full width each, stacked):
    
    TECHNICAL INTERVIEW
    bg-gray-900 border border-indigo-500/30 rounded-2xl p-8
    Icon: 💻 Code
    "DSA problems, live coding, hints on request"
    Difficulty: [Easy] [Medium] [Hard] selectors
    Topic: [Arrays] [Trees] [DP] [Graphs] [All Topics]
    "Start Technical Interview →" (primary CTA)
    
    SYSTEM DESIGN
    bg-gray-900 border border-violet-500/30 rounded-2xl p-8
    Icon: 🏗️ Architecture
    "Design YouTube, Uber, WhatsApp. AI evaluates your approach."
    "Start System Design →"
    
    HR / BEHAVIORAL
    bg-gray-900 border border-cyan-500/30 rounded-2xl p-8
    Icon: 🎤 HR
    "STAR format questions. Get feedback on your answers."
    "Start HR Interview →"
  
  HISTORY: "Past Sessions" list below with scores

ACTIVE INTERVIEW STATE (Technical):
  TOP BAR:
    "Technical Interview — Round 1" 
    Timer: "38:22" (countdown, red when < 5 min)
    "End Interview" (danger ghost button)
  
  QUESTION PANEL (top 40%):
    Question number: "Question 2 / 5"
    Difficulty badge: "Medium"
    Question text (rendered markdown for code examples)
    
    Tabs: Problem | Hints | Constraints
  
  CODE EDITOR (bottom 60%):
    Monaco editor, dark theme (vs-dark)
    Language selector: [Python ▼]
    Run code: "▶ Run" button (right)
    Output panel (collapsible at bottom): shows console output
  
  SUBMIT: "Submit Answer →" (primary, bottom right)

POST-INTERVIEW REPORT (/interview/report/:id):
  SCORE HEADER: "Interview Score: 68/100"
  Per-question breakdown cards
  For each question: Your answer | Model answer | AI Feedback
  Overall feedback paragraph
  "Retake Interview" + "Share Report" buttons
```

---

### SCREEN 11: Job Matching (/jobs)

```
[Locked state for Resume Score < 70]:
  Blurred/greyed layout
  Overlay card: "Unlock Job Matching"
  "Your Resume Score: 62/100 — Reach 70 to unlock"
  Progress bar + "What to improve" list

[Unlocked state]:
HEADER:
  "Job Matches for You"
  Filter bar: Role | Location | Company Type | Experience

MATCH CARDS (list view):
  For each job:
  ┌────────────────────────────────────────────────────────┐
  │ [Company Logo] Flipkart               Match: 82% 🟢   │
  │ Frontend Engineer — Bangalore          ₹8-12 LPA      │
  │ Skills you have: React ✓, JS ✓, REST ✓               │
  │ Skills to add: React Native ⚠, TypeScript ⚠           │
  │                                                        │
  │ [Tailor Resume] [Apply Now →]  Applied: ☐             │
  └────────────────────────────────────────────────────────┘

MATCH % BADGE COLORS:
  80-100%: green badge
  60-79%: amber badge  
  < 60%: red badge (still shown but with "Gap" label)

APPLICATION TRACKER (side panel or tab):
  Kanban board: Applied | Phone Screen | Interview | Offer | Rejected
```

---

### SCREEN 12: Progress Dashboard (/dashboard/progress)

```
HEADER: "Your Career Journey"
Tagline: "Keep the streak alive 🔥"

TOP ROW (stats):
  Current Streak: 12 days 🔥
  Total XP: 4,200 XP
  Skills Completed: 8 / 24
  Interviews Done: 3

STREAK CALENDAR:
  GitHub-style contribution heatmap
  Last 12 weeks
  Indigo for active days, gray for missed

SCORE HISTORY (line chart):
  Shows all 6 dimensions over time
  Toggle buttons to show/hide each dimension

SKILL PROGRESS (accordion by category):
  Backend Development: ████████░░ 3/5 skills
  DevOps: ██░░░░░░░░ 1/6 skills
  DSA: ████░░░░░░ 4/10 skills
  System Design: █░░░░░░░░░ 1/8 skills

XP & ACHIEVEMENTS:
  Recent XP events:
    "+200 XP — Completed Docker course" (2 days ago)
    "+150 XP — Upload resume" (5 days ago)
  
  Achievement badges (earned = colored, unearned = grayscale):
    🏆 First Resume Upload
    🎯 7-Day Streak
    📈 Score Improved 10 Points
    💬 Asked 10 Mentor Questions
```

---

### SCREEN 13: Pricing Page (/pricing)

```
HEADER:
  "Invest in Your Career"
  Annual/Monthly toggle pill (save 17% badge on annual)

3 PRICING CARDS:
  FREE (bg-gray-900):
    "Free Forever"
    ₹0
    Feature list with ✓ and ✗ marks
    CTA: "Get Started Free" (secondary)

  STUDENT PREMIUM (indigo glow card):
    "Most Popular" badge (violet pill, top)
    ₹149 / month (or ₹1,499/year)
    Everything in Free +
    Feature list
    CTA: "Start Free Trial" (gradient button)

  PRO (gradient border card):
    ₹399 / month (or ₹3,999/year)
    Feature list
    CTA: "Go Pro" (gradient button)

FEATURE COMPARISON TABLE (below cards):
  Full 3-column comparison with all features
  Sticky header with plan names
  Checkmarks / X / limited indicators

B2B SECTION (below table):
  "For Colleges & Institutions"
  Starting at ₹25,000/year per institution
  "Request a Demo" CTA
```

---

### SCREEN 14: College B2B Dashboard (/college)

```
HEADER: "[College Name] — Placement Dashboard"
Academic Year: 2025-26 | Export Report button

TOP METRICS (4 cards):
  Total Students: 847
  Avg ATS Score: 61/100
  Students Job-Ready (>70): 234 (28%)
  Placed This Year: 187

BATCH HEATMAP:
  Grid: X-axis = Month, Y-axis = Score range
  Color intensity shows student density
  Click to drill down into a cohort

STUDENT TABLE (sortable):
  Name | College ID | Career Goal | ATS Score | Readiness | Last Active
  Filter: By goal, by score range, by department

SCORE DISTRIBUTION:
  Histogram: Number of students at each score band
  Color-coded: Red (0-49) | Amber (50-69) | Green (70+)
  Benchmark line: "Industry avg for this batch type"

IMPROVEMENT TRACKING:
  Chart: Week-over-week avg score for batch
  Shows if training interventions are working
```

---

## 4. Motion & Animation Guidelines

```
TRANSITIONS:
  Default: transition-all duration-200 ease-in-out
  Page transitions: opacity fade + slight upward translate (translate-y-2)
  Modal open: scale from 0.95 + opacity 0 → 1
  Card hover: scale-[1.01] shadow-xl

LOADING STATES:
  Skeleton screens: animated gray shimmer blocks matching content shape
  Progress bars: smooth width transition over 1000ms
  Score radial: draw stroke animation from 0 to value over 1500ms

SCORE COUNTER ANIMATION:
  Count up from 0 to score value over 1200ms
  Easing: ease-out

STREAK FIRE 🔥:
  Gentle scale pulse on streak badge
  
AI MENTOR TYPING:
  3-dot bounce animation while AI is responding
  Text streams in character by character (SSE)

TOAST NOTIFICATIONS:
  Slide in from top-right
  Auto-dismiss after 4 seconds
  Types: success (green), error (red), info (indigo), warning (amber)
```

---

## 5. Responsive Breakpoints

```
Mobile:   320px – 639px    (1 column, compressed nav → hamburger)
Tablet:   640px – 1023px   (2 columns, sidebar collapsible)
Desktop:  1024px – 1279px  (sidebar + main, 2-3 col grids)
Wide:     1280px+           (sidebar + main, max-w-7xl centered)

MOBILE-SPECIFIC:
  Sidebar: slide-over drawer (Headless UI Dialog)
  Score chart: smaller (180px diameter)
  Roadmap: cards stacked vertically
  Pricing: single column, cards stacked
  Job cards: simplified, no inline stats

NAVIGATION (Mobile):
  Bottom tab bar: Dashboard | Mentor | Resume | Progress | Menu
```

---

## 6. Dark / Light Mode

```
Default: DARK MODE (primary experience, matches the dev/student audience)
Light mode: Available as toggle in settings

DARK MODE TOKENS (CSS variables):
  --bg-base:      #030712
  --bg-surface:   #111827
  --bg-elevated:  #1F2937
  --text-primary:  #F9FAFB
  --text-secondary: #9CA3AF
  --border:       #374151
  --border-accent: rgba(79,70,229,0.3)

LIGHT MODE TOKENS:
  --bg-base:       #FFFFFF
  --bg-surface:    #F9FAFB
  --bg-elevated:   #F3F4F6
  --text-primary:  #111827
  --text-secondary: #6B7280
  --border:        #E5E7EB
```

---

## 7. Empty States

```
Each major feature has a thoughtful empty state:

RESUME (no upload yet):
  Illustration: paper with upload arrow
  "Your resume is the key"
  "Upload it to unlock your Career Score, Gap Analysis, and personalized roadmap"
  CTA: "Upload Resume" (primary, large)

AI MENTOR (no chats):
  Waving robot icon
  "I'm ready to help"
  Suggested prompt chips

JOB MATCHING (score too low):
  Lock icon with score bar
  "You're [8 points] away from unlocking Job Matching"
  "Here's what to fix →" (links to improvements)

MOCK INTERVIEW (no sessions):
  Interview chair illustration
  "Practice until it feels easy"
  "Your first practice interview is free"

PROGRESS (new user):
  Empty calendar grid
  "Your journey starts today"
  "Complete any task to earn your first XP"
```

---

## 8. Error & Edge Case States

```
NETWORK ERROR:
  Toast: "Connection lost — retrying..." (amber)
  Retry button inline

AI MENTOR RATE LIMIT HIT:
  Message in chat: "You've used your 10 free messages today"
  "Upgrade for 100 messages/day →" (inline upgrade card)

RESUME PARSE FAILURE:
  Alert card: "We had trouble reading your resume"
  Suggestions: "Ensure it's a clean single-column PDF. Avoid tables, 
  headers/footers, or scanned images."
  "Try uploading a different file" + "Contact support"

PAYMENT FAILURE:
  Clear error message from Razorpay
  "Try again" + "Use different payment method"
  
FILE TYPE ERROR:
  Inline under dropzone: "Only PDF and DOCX files supported"
  
FILE TOO LARGE:
  "File size exceeds 5MB limit. Compress and try again."
```

---

*End of CareerOS Design Specification v1.0 — June 2026*
*This document is intended for use with Stitch or any AI design tool.*
