Using Node.js 20, Tailwind CSS v3.4.19, and Vite v7.2.4.

Tailwind CSS has been configured with the shadcn theme.

Create a polished WormGPT frontend with a subtle persistent watermark/branding:

WATERMARK:
"Bivanjit" / "Bivanjit © 2026"
Use it subtly in the bottom-right corner of the application.
It should remain visible without interfering with chat controls.
Use low opacity and a clean professional appearance.

Structure:

src/
├── components/
│   └── ui/
│       ├── accordion
│       ├── alert-dialog
│       ├── alert
│       ├── aspect-ratio
│       ├── avatar
│       ├── badge
│       ├── breadcrumb
│       ├── button-group
│       ├── button
│       ├── calendar
│       ├── card
│       ├── carousel
│       ├── chart
│       ├── checkbox
│       ├── collapsible
│       ├── command
│       ├── context-menu
│       ├── dialog
│       ├── drawer
│       ├── dropdown-menu
│       ├── empty
│       ├── field
│       ├── form
│       ├── hover-card
│       ├── input-group
│       ├── input-otp
│       ├── input
│       ├── item
│       ├── kbd
│       ├── label
│       ├── menubar
│       ├── navigation-menu
│       ├── pagination
│       ├── popover
│       ├── progress
│       ├── radio-group
│       ├── resizable
│       ├── scroll-area
│       ├── select
│       ├── separator
│       ├── sheet
│       ├── sidebar
│       ├── skeleton
│       ├── slider
│       ├── sonner
│       ├── spinner
│       ├── switch
│       ├── table
│       ├── tabs
│       ├── textarea
│       ├── toggle-group
│       ├── toggle
│       └── tooltip
│
├── sections/
├── hooks/
├── types/
├── App.css
├── App.tsx
├── index.css
└── main.tsx

Root files:

index.html
tailwind.config.js
postcss.config.js
vite.config.ts
package.json

Requirements:
- Responsive desktop/mobile layout
- Modern dark WormGPT-style interface
- Chat interface
- Clear message hierarchy
- Sidebar/navigation where appropriate
- Input area fixed to the bottom
- Loading state
- Error state
- Empty chat state
- Credit indicator prepared for a future backend credit system
- Display "10 Credits" initially as a frontend placeholder
- Do NOT store authoritative credits in localStorage
- Add a subtle "Bivanjit © 2026" watermark fixed to the bottom-right
- Watermark must not block pointer events
- Watermark must remain visually unobtrusive
- Keep the code modular and easy to connect to a remote backend later
