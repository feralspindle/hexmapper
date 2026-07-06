# Agent sandbox for hex-map: Node 20 + Rust + psql client + coding agents
# (claude, codex, opencode), non-root, with an egress firewall initialized at
# container start (see init-firewall.sh).
# Deliberately absent: SSH keys, supabase CLI auth, docker socket, prod creds.

FROM node:20-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential pkg-config libssl-dev \
        git curl ca-certificates \
        iptables ipset dnsutils jq \
        sudo postgresql-client \
        less ripgrep \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code @openai/codex opencode-ai

COPY init-firewall.sh post-create-root.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/init-firewall.sh /usr/local/bin/post-create-root.sh \
    && echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh, /usr/local/bin/post-create-root.sh" > /etc/sudoers.d/sandbox \
    && chmod 440 /etc/sudoers.d/sandbox

USER node
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH=/home/node/.cargo/bin:$PATH

WORKDIR /workspaces
