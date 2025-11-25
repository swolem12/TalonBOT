# TalonBOT

Signal Chatbot for Team Talon - Group chat monitoring, member management, and chat reporting.

## 🤖 What is TalonBOT?

TalonBOT is a Signal messenger bot that can be invited to your group chats to:
- **Monitor & Manage Members** - Track who's in the group, kick/ban/mute users
- **Generate Chat Reports** - Get summaries of conversations by timeframe, user, or topic
- **Provide Analytics** - See activity stats, most active users, and engagement metrics

## 📱 How Does the Bot Get Added to Your Signal Chat?

Unlike Discord or Slack bots, Signal doesn't have a traditional bot API. Instead, TalonBOT works like a regular Signal user:

### The Bot Needs Its Own Phone Number

1. **Get a phone number** for the bot (options below)
2. **Register it with Signal** using signal-cli
3. **Add the bot to your group** just like any other contact

### Phone Number Options

| Option | Cost | Pros | Cons |
|--------|------|------|------|
| **Google Voice** | Free | Easy setup, US numbers | Requires existing Google account |
| **Twilio** | ~$1/month | Programmable, reliable | Requires credit card |
| **TextNow** | Free | Easy | May get recycled |
| **Spare SIM card** | Varies | Most reliable | Costs money |

### Step-by-Step: Adding TalonBOT to Your Group

1. **Register the bot's phone number:**
   ```bash
   # Request SMS verification code
   signal-cli -a +1234567890 register
   
   # Enter the code you receive
   signal-cli -a +1234567890 verify 123456
   ```

2. **Start TalonBOT:**
   ```bash
   npm run start
   ```

3. **In Signal app on your phone:**
   - Add the bot's phone number as a new contact (e.g., "TalonBOT")
   - Open your group chat
   - Tap the group name → "Add members"
   - Select TalonBOT
   - The bot will now receive all group messages!

4. **Test it works:**
   - Send `!help` in the group
   - TalonBOT should respond with available commands

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **signal-cli** (Signal command-line interface)
- **A phone number** for the bot

### Installation

```bash
# Clone the repository
git clone https://github.com/swolem12/TalonBOT.git
cd TalonBOT

# Install dependencies
npm install

# Set up the database
npm run db:generate
npm run db:push

# Copy environment template
cp .env.template .env

# Edit .env with your settings
nano .env
```

### Configuration

Edit `.env` file:
```env
# Required: Bot's phone number (with country code)
SIGNAL_BOT_PHONE_NUMBER=+1234567890

# Admin phone numbers (can use all commands)
ADMIN_USERS=+1111111111,+2222222222

# Database (SQLite by default)
DATABASE_URL="file:./talonbot.db"
```

### Running the Bot

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm run start
```

## 📋 Commands

### Basic Commands
| Command | Description |
|---------|-------------|
| `!help` | Show all available commands |
| `!ping` | Check if bot is online |
| `!info` | Bot information and status |
| `!whoami` | Show your Signal info |

### Member Management (Admin/Moderator)
| Command | Description |
|---------|-------------|
| `!members` | List all group members |
| `!kick @user` | Remove user from group |
| `!ban @user` | Ban user from group |
| `!mute @user [minutes]` | Mute user temporarily |
| `!unmute @user` | Unmute user |

### Chat Reports
| Command | Description |
|---------|-------------|
| `!report [days]` | Generate activity report |
| `!summary [hours]` | Summarize recent messages |
| `!search <keyword>` | Search chat history |
| `!userstats @user` | Stats for specific user |

### Analytics (Admin)
| Command | Description |
|---------|-------------|
| `!stats` | Overall bot statistics |
| `!topusers` | Most active users |
| `!activity [days]` | Activity chart |

## 🏠 Hosting Options

### Option 1: Run on Your Computer
- Simplest for testing
- Must keep computer running
- Good for small teams

### Option 2: Raspberry Pi
- Cheap (~$50 one-time)
- Low power consumption
- Always on at home
- [Raspberry Pi Setup Guide](docs/raspberry-pi-setup.md)

### Option 3: VPS (Virtual Private Server)
- Most reliable
- ~$5-20/month
- Providers: DigitalOcean, Linode, Vultr, AWS Lightsail
- [VPS Setup Guide](docs/vps-setup.md)

### Option 4: Docker
```bash
docker-compose up -d
```
- Works on any platform
- Easy deployment
- [Docker Setup Guide](docs/docker-setup.md)

## 📁 Project Structure

```
TalonBOT/
├── src/
│   ├── index.ts          # Main entry point
│   ├── lib/              # Core libraries
│   │   ├── signal-cli.ts # Signal CLI integration
│   │   ├── prisma.ts     # Database client
│   │   └── logger.ts     # Logging utility
│   ├── plugins/          # Bot plugins
│   │   ├── base.ts       # Base plugin class
│   │   ├── core/         # Core commands
│   │   ├── members/      # Member management
│   │   ├── reports/      # Chat reporting
│   │   └── analytics/    # Statistics
│   └── types/            # TypeScript types
├── prisma/
│   └── schema.prisma     # Database schema
├── scripts/              # Setup scripts
├── docs/                 # Documentation
└── .env.template         # Environment template
```

## 🔧 Installing signal-cli

### macOS
```bash
brew install signal-cli
```

### Linux (Ubuntu/Debian)
```bash
# Install Java (required)
sudo apt install openjdk-17-jre

# Download signal-cli
wget https://github.com/AsamK/signal-cli/releases/download/v0.13.2/signal-cli-0.13.2-Linux.tar.gz
tar xf signal-cli-0.13.2-Linux.tar.gz
sudo mv signal-cli-0.13.2 /opt/signal-cli
sudo ln -sf /opt/signal-cli/bin/signal-cli /usr/local/bin/

# Verify installation
signal-cli --version
```

### Windows
1. Install Java 17+
2. Download signal-cli from [GitHub releases](https://github.com/AsamK/signal-cli/releases)
3. Extract and add to PATH

## 🔐 Security Notes

- **Phone number privacy**: The bot's phone number is visible to group members
- **End-to-end encryption**: Signal messages remain encrypted
- **Message storage**: Messages are stored locally for reports (configurable)
- **Admin access**: Only configured admin numbers can use admin commands

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## ❓ FAQ

### Why does the bot need its own phone number?
Signal requires all users (including bots) to have a registered phone number. This is part of Signal's security model.

### Can I use my personal number for the bot?
Technically yes, but not recommended. The bot will respond to all your messages, and you won't be able to use Signal normally on that number.

### Does the bot see encrypted messages?
Yes, because the bot is a member of the group, it receives decrypted messages just like any other member.

### Can the bot be in multiple groups?
Yes! Once registered, you can add the bot to any number of groups.

### What happens if signal-cli stops?
The bot will stop receiving messages. Set up a process manager like PM2 or systemd to auto-restart it.
