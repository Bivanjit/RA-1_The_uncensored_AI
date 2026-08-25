# WormGPT Frontend Project Specification

## Technology Stack

- Node.js 20
- Tailwind CSS v3.4.19
- Vite v7.2.4
- React
- TypeScript
- shadcn/ui theme

Tailwind CSS has been set up with the shadcn theme.

## Project Goal

Build a polished, modern, responsive WormGPT-style web application.

The interface should feel distinctive, dark, bold, modern, and technical rather than like a generic AI chatbot.

The application should be structured so that the frontend can later connect to a remote backend/API without requiring a major rewrite.

## Components

The project includes the following shadcn/ui components:

- accordion
- alert-dialog
- alert
- aspect-ratio
- avatar
- badge
- breadcrumb
- button-group
- button
- calendar
- card
- carousel
- chart
- checkbox
- collapsible
- command
- context-menu
- dialog
- drawer
- dropdown-menu
- empty
- field
- form
- hover-card
- input-group
- input-otp
- input
- item
- kbd
- label
- menubar
- navigation-menu
- pagination
- popover
- progress
- radio-group
- resizable
- scroll-area
- select
- separator
- sheet
- sidebar
- skeleton
- slider
- sonner
- spinner
- switch
- table
- tabs
- textarea
- toggle-group
- toggle
- tooltip

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
