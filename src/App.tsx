import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import {
  Search, Wrench, AtSign, Send, Sparkles, Code, Terminal,
  Cpu, Globe, Mic, Volume2, VolumeX, Download, Upload, Moon, Sun, Settings,
  Activity, Lock, Eye, EyeOff, Database, CheckCircle2, XCircle, RefreshCw,
  Square, RotateCcw, Copy, Check, Trash2, Edit3, MoreVertical, X, Wifi,
  Play, GitBranch, GitCommit, FolderOpen, FileText, Map, Command, Clock,
  BookOpen, Columns, Layout, MousePointer, Plus, Save, ExternalLink,
  Network, Diff, Share2
} from 'lucide-react';

// Keep the existing RA-1 application logic intact.
// Logo helper uses the Vite/GitHub Pages base path and the self-contained SVG asset.
const RA1Logo = ({ size = 32, className = '' }: { size?: number; className?: string }) => (
  <img
    src={`${import.meta.env.BASE_URL}RA1-logo.svg`}
    alt="RA-1"
    width={size}
    height={size}
    className={`rounded-lg object-cover ${className}`}
    onError={(event) => {
      const img = event.currentTarget;
      if (!img.dataset.fallbackApplied) {
        img.dataset.fallbackApplied = '1';
        img.src = `${import.meta.env.BASE_URL}RA1-logo.png`;
      }
    }}
  />
);
