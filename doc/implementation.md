# 📲 Telegram Mini App Integration Guide

## 🧭 Overview

This document outlines how we're integrating a **Telegram Mini App** into our existing project. Telegram Mini Apps are lightweight web applications that run inside the Telegram client and interact with users via Telegram’s WebApp SDK.

We’ll use the CLI tool [`@telegram-apps/create-mini-app`](https://docs.telegram-mini-apps.com/packages/telegram-apps-create-mini-app) to scaffold the app, and embed it into our project as a standalone frontend module.

---

## 🚀 Goals

- Scaffold a Telegram Mini App using React + TypeScript  
- Use the `@telegram-apps/sdk` (aka `tma.js`) for Telegram integration  
- Port **all existing bot features** into the mini app as UI flows  
- Host the app publicly (via **Vercel**) and link it to our Telegram bot  
- Ensure seamless communication between the mini app and our backend  
- Maintain modularity by keeping the mini app in its own folder  

---

## 🛠️ Setup Instructions

### 1. Scaffold the Mini App

Run the CLI tool in the terminal:

```bash
npx @telegram-apps/create-mini-app@latest