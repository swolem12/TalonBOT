#!/bin/bash

# TalonBOT Setup Script
# This script helps you set up signal-cli and configure TalonBOT

set -e

echo "🤖 TalonBOT Setup Script"
echo "========================"
echo ""

# Check for required dependencies
check_dependencies() {
    echo "📋 Checking dependencies..."
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        echo "✅ Node.js: $NODE_VERSION"
    else
        echo "❌ Node.js not found. Please install Node.js 18+"
        exit 1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        echo "✅ npm: $NPM_VERSION"
    else
        echo "❌ npm not found"
        exit 1
    fi
    
    # Check Java (required for signal-cli)
    if command -v java &> /dev/null; then
        JAVA_VERSION=$(java -version 2>&1 | head -n 1)
        echo "✅ Java: $JAVA_VERSION"
    else
        echo "⚠️  Java not found (required for signal-cli)"
        echo "   Install Java 17+ from https://adoptium.net/"
    fi
    
    # Check signal-cli
    if command -v signal-cli &> /dev/null; then
        SIGNAL_VERSION=$(signal-cli --version 2>&1 || echo "unknown")
        echo "✅ signal-cli: $SIGNAL_VERSION"
    else
        echo "⚠️  signal-cli not found"
        echo "   Run this script with --install-signal-cli to install"
    fi
    
    echo ""
}

# Install signal-cli
install_signal_cli() {
    echo "📦 Installing signal-cli..."
    
    SIGNAL_CLI_VERSION="0.13.2"
    DOWNLOAD_URL="https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/signal-cli-${SIGNAL_CLI_VERSION}-Linux.tar.gz"
    
    # Detect OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - use Homebrew
        if command -v brew &> /dev/null; then
            echo "Installing via Homebrew..."
            brew install signal-cli
        else
            echo "❌ Please install Homebrew first: https://brew.sh"
            exit 1
        fi
    else
        # Linux
        echo "Downloading signal-cli v${SIGNAL_CLI_VERSION}..."
        
        # Download
        wget -q "$DOWNLOAD_URL" -O /tmp/signal-cli.tar.gz
        
        # Extract
        sudo tar xf /tmp/signal-cli.tar.gz -C /opt/
        sudo ln -sf /opt/signal-cli-${SIGNAL_CLI_VERSION}/bin/signal-cli /usr/local/bin/
        
        # Cleanup
        rm /tmp/signal-cli.tar.gz
        
        echo "✅ signal-cli installed to /opt/signal-cli-${SIGNAL_CLI_VERSION}"
    fi
}

# Register Signal number
register_signal() {
    echo ""
    echo "📱 Signal Registration"
    echo "====================="
    echo ""
    read -p "Enter the phone number for the bot (with country code, e.g., +1234567890): " PHONE_NUMBER
    
    if [[ ! "$PHONE_NUMBER" =~ ^\+[0-9]{10,15}$ ]]; then
        echo "❌ Invalid phone number format. Use format: +1234567890"
        exit 1
    fi
    
    echo ""
    echo "Requesting verification code via SMS..."
    signal-cli -a "$PHONE_NUMBER" register
    
    echo ""
    read -p "Enter the verification code you received: " VERIFICATION_CODE
    
    echo ""
    echo "Verifying..."
    signal-cli -a "$PHONE_NUMBER" verify "$VERIFICATION_CODE"
    
    echo ""
    echo "✅ Signal registration complete!"
    echo ""
    echo "Update your .env file with:"
    echo "SIGNAL_BOT_PHONE_NUMBER=$PHONE_NUMBER"
}

# Create .env file
create_env() {
    echo ""
    echo "📝 Creating .env file..."
    
    if [ -f ".env" ]; then
        read -p ".env already exists. Overwrite? (y/N): " OVERWRITE
        if [[ "$OVERWRITE" != "y" && "$OVERWRITE" != "Y" ]]; then
            echo "Keeping existing .env"
            return
        fi
    fi
    
    read -p "Bot phone number (with country code): " BOT_PHONE
    read -p "Admin phone numbers (comma-separated): " ADMIN_PHONES
    
    cat > .env << EOF
# TalonBOT Configuration
SIGNAL_BOT_PHONE_NUMBER=$BOT_PHONE
ADMIN_USERS=$ADMIN_PHONES
DATABASE_URL="file:./talonbot.db"
BOT_PREFIX=!
STORE_MESSAGES=true
DEBUG=false
LOG_LEVEL=info
EOF
    
    echo "✅ .env file created"
}

# Initialize database
init_database() {
    echo ""
    echo "🗄️  Initializing database..."
    
    npx prisma generate
    npx prisma db push
    
    echo "✅ Database initialized"
}

# Main menu
show_menu() {
    echo ""
    echo "What would you like to do?"
    echo ""
    echo "1) Check dependencies"
    echo "2) Install signal-cli"
    echo "3) Register Signal number"
    echo "4) Create .env configuration"
    echo "5) Initialize database"
    echo "6) Full setup (all of the above)"
    echo "7) Exit"
    echo ""
    read -p "Enter choice [1-7]: " CHOICE
    
    case $CHOICE in
        1) check_dependencies ;;
        2) install_signal_cli ;;
        3) register_signal ;;
        4) create_env ;;
        5) init_database ;;
        6)
            check_dependencies
            if ! command -v signal-cli &> /dev/null; then
                install_signal_cli
            fi
            create_env
            npm install
            init_database
            echo ""
            echo "🎉 Setup complete!"
            echo ""
            echo "Next steps:"
            echo "1. Register your Signal number: npm run setup:signal"
            echo "2. Start the bot: npm run dev"
            ;;
        7) exit 0 ;;
        *) echo "Invalid choice" ;;
    esac
}

# Parse command line arguments
case "${1:-}" in
    --check)
        check_dependencies
        ;;
    --install-signal-cli)
        install_signal_cli
        ;;
    --register)
        register_signal
        ;;
    --env)
        create_env
        ;;
    --init-db)
        init_database
        ;;
    *)
        show_menu
        ;;
esac
