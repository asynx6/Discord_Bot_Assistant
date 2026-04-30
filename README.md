# 🤖 Discord Bot Assistant

> **⚠️ STATUS: BETA VERSION**  
> This project is currently in its **Beta** phase. While the core engine is fully functional, some features may still need tweaking or further development. Please use caution when running mass commands on production servers. If you use this bot and find any bugs or issues, please don't hesitate to leave feedback!

Discord Bot Assistant is an AI-powered management bot designed to understand natural, everyday language. Instead of relying on rigid commands, you can converse with the bot naturally, and it can execute dozens of complex commands in a **SINGLE SENTENCE**.

Built with the **ASYNX6** architecture and powered by LLMs (e.g., GPT-4o-mini via OpenRouter), this bot is capable of independently managing server hierarchies, permissions, and automated channel designs.

---

## 🔥 Key Features

- **🧠 Natural Language Processing (NLP)**  
  No need to memorize commands! Just chat with the bot normally. Example: *"Bot, create 5 roles from Founder to Member, then create an Admin category with 3 channels inside it."*
  
- **⚡ Multi-Action Pipeline**  
  A single request from the user is automatically parsed into a sequence of dependent actions. The bot understands dependencies (e.g., creating a Category first before creating Channels inside it).
  
- **🛡️ Auto-Permission & Hierarchy Intelligence**  
  When asked to create a "Founder" or "Owner" role, the bot **automatically** assigns `Administrator` privileges. For "Moderator" roles, it automatically grants kick/ban/manage messages permissions without needing explicit instructions.

- **🎨 Auto-Styling & Community Support**  
  - Automatically assigns fitting HEX colors to new roles.
  - Intelligently generates aesthetic names and emojis for channels.
  - Fully supports modern Discord Community Server features, including **FORUM**, **ANNOUNCEMENT**, and **STAGE** channels, in addition to TEXT and VOICE.

- **⏪ Snapshot & Master Undo**  
  Whenever the bot performs mass structural changes (like creating or deleting multiple channels and roles), it **automatically creates a backup** in your MongoDB database. If you make a mistake, simply say *"Undo"*, and the server will revert to its previous state.

- **💬 Live Progress Output**  
  When handling heavy requests (e.g., creating 50 channels at once), the bot displays a live *Progress Message* that is automatically updated into a casual, AI-generated summary once all tasks are complete.

---

## 🛠️ Tech Stack

- **Node.js** v22+
- **Discord.js** v14
- **Mongoose** for MongoDB Database & Snapshot System
- **OpenAI / OpenRouter API** (Recommended: GPT-4o-mini) for the AI brain

---

## ⚙️ Installation & Setup

1. **Clone this repository**
   ```bash
   git clone https://github.com/asynx6/Discord-Bot-Assistant.git
   cd Discord-Bot-Assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**  
   Create a `.env` file in the root directory and fill it with the following configuration:
   ```env
   TOKEN_BOT=your_discord_bot_token
   OPENROUTER_API_KEY=your_openrouter_api_key
   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/yourdbname
   DISCORD_OWNER_ID=your_discord_id
   ```
   *Helpful Links:*
   - Get your MongoDB URI by creating a free database cluster at [MongoDB Atlas](https://www.mongodb.com/atlas/database).
   - Get your API Key and select your AI model (e.g., GPT-4o-mini) at [OpenRouter](https://openrouter.ai/).
   
   > *Note: For security reasons, the bot will only respond to the user ID registered in `DISCORD_OWNER_ID`.*

4. **Run the Bot**
   ```bash
   node index.js
   ```

---

## 📖 Usage Examples

Simply mention the bot in a channel and speak to it naturally:

**1. Mass Role & Channel Creation**  
> *"@Bot please create 10 roles from member up to founder and figure out the best permissions for them. Then create 3 categories (Public Interaction, Admin, Announce) and put 5 channels in each containing a mix of text, voice, and forums. Use emojis for the names!"*

**2. Server Cleanup (Nuke Filter)**  
> *"@Bot delete all channels and roles in this server, but spare this current channel so we can still chat."*

**3. Quick Moderation**  
> *"@Bot mute @UserA for 10 minutes and kick @UserB."*

---

## 🤝 Contribution & Feedback
As this is a Beta release, there might be unexpected bugs or edge cases. If you encounter any issues or have suggestions, please provide feedback or open an issue! 

Made with 💻 and ☕.