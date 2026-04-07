import { Command, Option } from 'clipanion';
import { colors, error } from '../onboarding/index.js';

export class MeshCommand extends Command {
  static override paths = [['mesh']];

  static override usage = Command.Usage({
    description: 'Manage peer mesh network for multi-machine agent distribution',
    details: `
      The mesh command helps you manage a peer-to-peer network of hosts
      running SkillKit agents across multiple machines.

      Subcommands:
      - init:      Initialize local host for mesh networking
      - add:       Add a peer host to the network
      - remove:    Remove a host from the network
      - list:      List all known hosts and peers
      - health:    Check health of all hosts
      - discover:  Discover hosts on local network
      - status:    Show mesh network status
      - security:  Security management (init, status)
      - peer:      Peer trust management (trust, revoke, list)
    `,
    examples: [
      ['Initialize mesh', '$0 mesh init'],
      ['Add a host', '$0 mesh add 192.168.1.100:9876'],
      ['Add with name', '$0 mesh add 192.168.1.100 --name workstation'],
      ['Remove a host', '$0 mesh remove <hostId>'],
      ['List all hosts', '$0 mesh list'],
      ['Check health', '$0 mesh health'],
      ['Discover hosts', '$0 mesh discover'],
      ['Initialize security', '$0 mesh security init'],
      ['Show security status', '$0 mesh security status'],
      ['Trust a peer', '$0 mesh peer trust <fingerprint>'],
      ['Revoke a peer', '$0 mesh peer revoke <fingerprint>'],
      ['List trusted peers', '$0 mesh peer list --trusted'],
    ],
  });

  action = Option.String({ required: false });
  arg = Option.String({ required: false });
  subArg = Option.String({ required: false });
  name = Option.String('--name,-n', { description: 'Name for the host' });
  port = Option.String('--port,-p', { description: 'Port number' });
  tailscale = Option.Boolean('--tailscale,-t', false, { description: 'Include Tailscale peers' });
  timeout = Option.String('--timeout', { description: 'Timeout in milliseconds' });
  json = Option.Boolean('--json,-j', false, { description: 'Output in JSON format' });
  verbose = Option.Boolean('--verbose,-v', false, { description: 'Show detailed output' });
  trusted = Option.Boolean('--trusted', false, { description: 'Show only trusted peers' });
  securityLevel = Option.String('--security', { description: 'Security level: development, signed, secure, strict' });

  async execute(): Promise<number> {
    const action = this.action || 'status';

    switch (action) {
      case 'init':
        return this.initMesh();
      case 'add':
        return this.addHost();
      case 'remove':
        return this.removeHost();
      case 'list':
        return this.listHosts();
      case 'health':
        return this.checkHealth();
      case 'discover':
        return this.discoverHosts();
      case 'status':
        return this.showStatus();
      case 'security':
        return this.handleSecurity();
      case 'peer':
        return this.handlePeer();
      default:
        error(`Unknown action: ${action}`);
        console.log(colors.muted('Available actions: init, add, remove, list, health, discover, status, security, peer'));
        return 1;
    }
  }

  private async initMesh(): Promise<number> {
    try {
      const { initializeHostsFile, getLocalIPAddress, isTailscaleAvailable, getTailscaleIP } = await import('@skillkit/mesh');

      const hostsFile = await initializeHostsFile();
      const localConfig = hostsFile.localHost;
      const localIP = getLocalIPAddress();

      console.log(colors.success('✓ Mesh network initialized\n'));

      console.log(colors.bold('Local Host Configuration:'));
      console.log(`  ID: ${colors.cyan(localConfig.id.slice(0, 8))}`);
      console.log(`  Name: ${localConfig.name}`);
      console.log(`  Address: ${localIP}:${localConfig.port}`);

      const hasTailscale = await isTailscaleAvailable();
      if (hasTailscale) {
        const tailscaleIP = await getTailscaleIP();
        if (tailscaleIP) {
          console.log(`  Tailscale: ${tailscaleIP}:${localConfig.port}`);
        }
      }

      console.log();
      console.log(colors.muted('Other hosts can connect to this machine using:'));
      console.log(colors.muted(`  skillkit mesh add ${localIP}:${localConfig.port}`));

      return 0;
    } catch (err: any) {
      error(`Failed to initialize mesh: ${err.message}`);
      return 1;
    }
  }

  private async addHost(): Promise<number> {
    if (!this.arg) {
      error('Error: Host address is required');
      console.log(colors.muted('Usage: skillkit mesh add <address>[:port]'));
      return 1;
    }

    try {
      const { addKnownHost, DEFAULT_PORT } = await import('@skillkit/mesh');
      const { randomUUID } = await import('node:crypto');

      const [address, portStr] = this.arg.split(':');
      const portValue = portStr ?? this.port;
      const port = portValue ? Number(portValue) : DEFAULT_PORT;
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        error(`Invalid port: ${portValue}`);
        return 1;
      }

      const host = {
        id: randomUUID(),
        name: this.name || address,
        address,
        port,
        status: 'unknown' as const,
        lastSeen: new Date().toISOString(),
      };

      await addKnownHost(host);

      console.log(colors.success(`✓ Added host: ${host.name}`));
      console.log(`  ID: ${colors.muted(host.id.slice(0, 8))}`);
      console.log(`  Address: ${host.address}:${host.port}`);

      console.log(colors.muted('\nRun "skillkit mesh health" to verify connectivity.'));

      return 0;
    } catch (err: any) {
      error(`Failed to add host: ${err.message}`);
      return 1;
    }
  }

  private async removeHost(): Promise<number> {
    if (!this.arg) {
      error('Error: Host ID is required');
      console.log(colors.muted('Usage: skillkit mesh remove <hostId>'));
      return 1;
    }

    try {
      const { removeKnownHost, getKnownHosts } = await import('@skillkit/mesh');

      const hosts = await getKnownHosts();
      const host = hosts.find(h => h.id === this.arg || h.id.startsWith(this.arg!) || h.name === this.arg);

      if (!host) {
        error(`Host not found: ${this.arg}`);
        return 1;
      }

      const removed = await removeKnownHost(host.id);

      if (removed) {
        console.log(colors.success(`✓ Removed host: ${host.name}`));
      } else {
        error('Failed to remove host');
        return 1;
      }

      return 0;
    } catch (err: any) {
      error(`Failed to remove host: ${err.message}`);
      return 1;
    }
  }

  private async listHosts(): Promise<number> {
    try {
      const { getKnownHosts, getLocalHostConfig, getLocalIPAddress, discoverTailscaleHosts, isTailscaleAvailable } = await import('@skillkit/mesh');

      const localConfig = await getLocalHostConfig();
      const localIP = getLocalIPAddress();
      const hosts = await getKnownHosts();

      if (this.json) {
        console.log(JSON.stringify({ localHost: { ...localConfig, address: localIP }, hosts }, null, 2));
        return 0;
      }

      console.log(colors.bold('\nLocal Host:\n'));
      console.log(`  ${colors.cyan('●')} ${localConfig.name} ${colors.success('[local]')}`);
      console.log(`    ID: ${colors.muted(localConfig.id.slice(0, 8))}`);
      console.log(`    Address: ${localIP}:${localConfig.port}`);

      console.log(colors.bold('\nKnown Hosts:\n'));

      if (hosts.length === 0) {
        console.log(colors.muted('  No hosts configured.'));
        console.log(colors.muted('  Add hosts with: skillkit mesh add <address>'));
      } else {
        for (const host of hosts) {
          const statusIcon = host.status === 'online' ? colors.success('●') : host.status === 'offline' ? colors.error('●') : colors.muted('○');
          const statusLabel = host.status === 'online' ? colors.success('[online]') : host.status === 'offline' ? colors.error('[offline]') : colors.muted('[unknown]');

          console.log(`  ${statusIcon} ${host.name} ${statusLabel}`);
          console.log(`    ID: ${colors.muted(host.id.slice(0, 8))}`);
          console.log(`    Address: ${host.address}:${host.port}`);
          if (host.tailscaleIP) {
            console.log(`    Tailscale: ${host.tailscaleIP}`);
          }
          if (this.verbose) {
            console.log(`    Last seen: ${new Date(host.lastSeen).toLocaleString()}`);
          }
        }
      }

      if (this.tailscale) {
        const hasTailscale = await isTailscaleAvailable();
        if (hasTailscale) {
          const tailscaleHosts = await discoverTailscaleHosts(localConfig.port);

          if (tailscaleHosts.length > 0) {
            console.log(colors.bold('\nTailscale Peers:\n'));
            for (const host of tailscaleHosts) {
              console.log(`  ${colors.info('◆')} ${host.name}`);
              console.log(`    IP: ${host.tailscaleIP}`);
            }
          }
        }
      }

      console.log();
      return 0;
    } catch (err: any) {
      error(`Failed to list hosts: ${err.message}`);
      return 1;
    }
  }

  private async checkHealth(): Promise<number> {
    try {
      const { checkAllHostsHealth, getKnownHosts } = await import('@skillkit/mesh');

      const hosts = await getKnownHosts();

      if (hosts.length === 0) {
        console.log(colors.warning('No hosts configured.'));
        console.log(colors.muted('Add hosts with: skillkit mesh add <address>'));
        return 0;
      }

      console.log(colors.bold('\nChecking host health...\n'));

      const timeout = this.timeout ? parseInt(this.timeout, 10) : undefined;
      const results = await checkAllHostsHealth({ timeout });

      if (this.json) {
        console.log(JSON.stringify(results, null, 2));
        return 0;
      }

      let hasFailures = false;

      for (const result of results) {
        const host = hosts.find(h => h.id === result.hostId);
        const name = host?.name || result.hostId.slice(0, 8);

        if (result.status === 'online') {
          console.log(`  ${colors.success('✓')} ${name} - ${colors.success('online')} (${result.latencyMs}ms)`);
        } else {
          hasFailures = true;
          console.log(`  ${colors.error('✗')} ${name} - ${colors.error('offline')} ${result.error ? `(${result.error})` : ''}`);
        }
      }

      console.log();

      const online = results.filter(r => r.status === 'online').length;
      const total = results.length;
      console.log(`${online}/${total} hosts online`);

      return hasFailures ? 1 : 0;
    } catch (err: any) {
      error(`Failed to check health: ${err.message}`);
      return 1;
    }
  }

  private async discoverHosts(): Promise<number> {
    try {
      const { discoverOnce, isTailscaleAvailable, discoverTailscaleHosts, getLocalHostConfig } = await import('@skillkit/mesh');

      console.log(colors.bold('\nDiscovering hosts on local network...\n'));

      const timeout = this.timeout ? parseInt(this.timeout, 10) : 5000;

      const localHosts = await discoverOnce(timeout);

      if (localHosts.length === 0) {
        console.log(colors.muted('  No hosts discovered on local network.'));
      } else {
        console.log(colors.cyan('Local Network:'));
        for (const host of localHosts) {
          console.log(`  ${colors.success('●')} ${host.name}`);
          console.log(`    Address: ${host.address}:${host.port}`);
        }
      }

      if (this.tailscale) {
        const hasTailscale = await isTailscaleAvailable();
        if (hasTailscale) {
          const localConfig = await getLocalHostConfig();
          const tailscaleHosts = await discoverTailscaleHosts(localConfig.port);

          if (tailscaleHosts.length > 0) {
            console.log(colors.cyan('\nTailscale Network:'));
            for (const host of tailscaleHosts) {
              console.log(`  ${colors.info('◆')} ${host.name}`);
              console.log(`    Tailscale IP: ${host.tailscaleIP}`);
            }
          } else {
            console.log(colors.muted('\n  No Tailscale peers found.'));
          }
        } else {
          console.log(colors.muted('\n  Tailscale not available.'));
        }
      }

      console.log();
      return 0;
    } catch (err: any) {
      error(`Failed to discover hosts: ${err.message}`);
      return 1;
    }
  }

  private async showStatus(): Promise<number> {
    try {
      const { getKnownHosts, getLocalHostConfig, getLocalIPAddress, isTailscaleAvailable, getTailscaleIP, getPeerRegistry } = await import('@skillkit/mesh');

      const localConfig = await getLocalHostConfig();
      const localIP = getLocalIPAddress();
      const hosts = await getKnownHosts();
      const registry = await getPeerRegistry();
      const localPeers = registry.getLocalPeers();

      const onlineHosts = hosts.filter(h => h.status === 'online').length;
      const hasTailscale = await isTailscaleAvailable();

      if (this.json) {
        console.log(JSON.stringify({
          localHost: { ...localConfig, address: localIP },
          hosts: hosts.length,
          onlineHosts,
          localPeers: localPeers.length,
          tailscaleAvailable: hasTailscale,
        }, null, 2));
        return 0;
      }

      console.log(colors.bold('\nMesh Network Status\n'));

      console.log(colors.cyan('Local Host:'));
      console.log(`  Name: ${localConfig.name}`);
      console.log(`  ID: ${colors.muted(localConfig.id.slice(0, 8))}`);
      console.log(`  Address: ${localIP}:${localConfig.port}`);

      if (hasTailscale) {
        const tailscaleIP = await getTailscaleIP();
        if (tailscaleIP) {
          console.log(`  Tailscale: ${colors.info(tailscaleIP)}`);
        }
      }

      console.log();
      console.log(colors.cyan('Network:'));
      console.log(`  Known hosts: ${hosts.length}`);
      console.log(`  Online: ${onlineHosts}`);
      console.log(`  Local peers: ${localPeers.length}`);
      console.log(`  Tailscale: ${hasTailscale ? colors.success('available') : colors.muted('not available')}`);

      console.log();
      return 0;
    } catch (err: any) {
      error(`Failed to get status: ${err.message}`);
      return 1;
    }
  }

  private async handleSecurity(): Promise<number> {
    const subAction = this.arg || 'status';

    switch (subAction) {
      case 'init':
        return this.initSecurity();
      case 'status':
        return this.showSecurityStatus();
      default:
        error(`Unknown security action: ${subAction}`);
        console.log(colors.muted('Available actions: init, status'));
        return 1;
    }
  }

  private async initSecurity(): Promise<number> {
    try {
      const { SecureKeystore, TLSManager, getLocalHostConfig, describeSecurityLevel, DEFAULT_SECURITY_CONFIG } = await import('@skillkit/mesh');

      console.log(colors.bold('\nInitializing mesh security...\n'));

      const keystore = new SecureKeystore();
      const identity = await keystore.loadOrCreateIdentity();

      console.log(colors.success('✓ Identity created/loaded'));
      console.log(`  Fingerprint: ${colors.cyan(identity.fingerprint)}`);
      console.log(`  Public Key: ${colors.muted(identity.publicKeyHex.slice(0, 32))}...`);

      const localConfig = await getLocalHostConfig();
      const tlsManager = new TLSManager();
      const certInfo = await tlsManager.loadOrCreateCertificate(localConfig.id, 'localhost');

      console.log(colors.success('\n✓ TLS certificate generated'));
      console.log(`  Fingerprint: ${colors.muted(certInfo.fingerprint.slice(0, 16))}...`);
      console.log(`  Valid until: ${certInfo.notAfter.toLocaleDateString()}`);

      console.log(colors.success('\n✓ Security initialized'));
      console.log(`  Mode: ${colors.cyan(describeSecurityLevel(DEFAULT_SECURITY_CONFIG))}`);

      console.log(colors.muted('\nOther hosts can trust this peer using:'));
      console.log(colors.muted(`  skillkit mesh peer trust ${identity.fingerprint}`));

      console.log();
      return 0;
    } catch (err: any) {
      error(`Failed to initialize security: ${err.message}`);
      return 1;
    }
  }

  private async showSecurityStatus(): Promise<number> {
    try {
      const {
        SecureKeystore,
        TLSManager,
        getLocalHostConfig,
        describeSecurityLevel,
        DEFAULT_SECURITY_CONFIG,
        isSecurityEnabled,
      } = await import('@skillkit/mesh');

      const keystore = new SecureKeystore();

      console.log(colors.bold('\nMesh Security Status\n'));

      const hasIdentity = await keystore.hasIdentity();

      if (hasIdentity) {
        const identity = await keystore.loadOrCreateIdentity();
        const trustedPeers = await keystore.getTrustedPeers();
        const revokedPeers = await keystore.getRevokedFingerprints();

        console.log(colors.cyan('Identity:'));
        console.log(`  Fingerprint: ${colors.success(identity.fingerprint)}`);
        console.log(`  Public Key: ${colors.muted(identity.publicKeyHex.slice(0, 32))}...`);

        console.log(colors.cyan('\nTrust:'));
        console.log(`  Trusted peers: ${trustedPeers.length}`);
        console.log(`  Revoked peers: ${revokedPeers.length}`);

        if (this.verbose && trustedPeers.length > 0) {
          console.log(colors.cyan('\nTrusted Peers:'));
          for (const peer of trustedPeers) {
            console.log(`  ${colors.success('●')} ${peer.name || peer.fingerprint.slice(0, 16)}`);
            console.log(`    Fingerprint: ${colors.muted(peer.fingerprint)}`);
            console.log(`    Added: ${new Date(peer.addedAt).toLocaleDateString()}`);
          }
        }
      } else {
        console.log(colors.warning('Identity: Not initialized'));
        console.log(colors.muted('Run "skillkit mesh security init" to initialize.'));
      }

      const localConfig = await getLocalHostConfig();
      const tlsManager = new TLSManager();
      const hasCert = await tlsManager.hasCertificate(localConfig.id);

      console.log(colors.cyan('\nTLS:'));
      if (hasCert) {
        const certInfo = await tlsManager.loadCertificate(localConfig.id);
        console.log(`  Certificate: ${colors.success('Available')}`);
        if (certInfo) {
          console.log(`  Fingerprint: ${colors.muted(certInfo.fingerprint.slice(0, 16))}...`);
        }
      } else {
        console.log(`  Certificate: ${colors.warning('Not generated')}`);
      }

      console.log(colors.cyan('\nConfiguration:'));
      console.log(`  Security level: ${colors.cyan(describeSecurityLevel(DEFAULT_SECURITY_CONFIG))}`);
      console.log(`  Discovery mode: ${DEFAULT_SECURITY_CONFIG.discovery.mode}`);
      console.log(`  Transport encryption: ${DEFAULT_SECURITY_CONFIG.transport.encryption}`);
      console.log(`  Auth required: ${DEFAULT_SECURITY_CONFIG.transport.requireAuth ? colors.success('yes') : colors.muted('no')}`);

      if (this.json) {
        const identity = hasIdentity ? await keystore.loadOrCreateIdentity() : null;
        console.log(JSON.stringify({
          hasIdentity,
          fingerprint: identity?.fingerprint,
          hasCertificate: hasCert,
          securityEnabled: isSecurityEnabled(DEFAULT_SECURITY_CONFIG),
          config: DEFAULT_SECURITY_CONFIG,
        }, null, 2));
      }

      console.log();
      return 0;
    } catch (err: any) {
      error(`Failed to get security status: ${err.message}`);
      return 1;
    }
  }

  private async handlePeer(): Promise<number> {
    const subAction = this.arg;

    if (!subAction) {
      error('Error: Peer action is required');
      console.log(colors.muted('Usage: skillkit mesh peer <trust|revoke|list> [fingerprint]'));
      return 1;
    }

    switch (subAction) {
      case 'trust':
        return this.trustPeer();
      case 'revoke':
        return this.revokePeer();
      case 'list':
        return this.listPeers();
      default:
        error(`Unknown peer action: ${subAction}`);
        console.log(colors.muted('Available actions: trust, revoke, list'));
        return 1;
    }
  }

  private async trustPeer(): Promise<number> {
    const fingerprint = this.subArg;

    if (!fingerprint) {
      error('Error: Fingerprint is required');
      console.log(colors.muted('Usage: skillkit mesh peer trust <fingerprint> [--name <name>]'));
      return 1;
    }

    try {
      const { SecureKeystore } = await import('@skillkit/mesh');

      const keystore = new SecureKeystore();

      const isRevoked = await keystore.isRevoked(fingerprint);
      if (isRevoked) {
        console.log(colors.warning(`Peer ${fingerprint.slice(0, 8)} was previously revoked. Removing from revoked list...`));
      }

      await keystore.addTrustedPeer(fingerprint, '', this.name);

      console.log(colors.success(`✓ Trusted peer: ${this.name || fingerprint.slice(0, 16)}`));
      console.log(`  Fingerprint: ${colors.muted(fingerprint)}`);

      return 0;
    } catch (err: any) {
      error(`Failed to trust peer: ${err.message}`);
      return 1;
    }
  }

  private async revokePeer(): Promise<number> {
    const fingerprint = this.subArg;

    if (!fingerprint) {
      error('Error: Fingerprint is required');
      console.log(colors.muted('Usage: skillkit mesh peer revoke <fingerprint>'));
      return 1;
    }

    try {
      const { SecureKeystore } = await import('@skillkit/mesh');

      const keystore = new SecureKeystore();
      await keystore.revokePeer(fingerprint);

      console.log(colors.success(`✓ Revoked peer: ${fingerprint.slice(0, 16)}`));
      console.log(colors.muted('This peer will no longer be trusted for mesh communication.'));

      return 0;
    } catch (err: any) {
      error(`Failed to revoke peer: ${err.message}`);
      return 1;
    }
  }

  private async listPeers(): Promise<number> {
    try {
      const { SecureKeystore } = await import('@skillkit/mesh');

      const keystore = new SecureKeystore();
      const trustedPeers = await keystore.getTrustedPeers();
      const revokedFingerprints = await keystore.getRevokedFingerprints();

      if (this.json) {
        console.log(JSON.stringify({ trusted: trustedPeers, revoked: revokedFingerprints }, null, 2));
        return 0;
      }

      console.log(colors.bold('\nPeer Trust Status\n'));

      if (this.trusted || trustedPeers.length > 0) {
        console.log(colors.cyan('Trusted Peers:'));
        if (trustedPeers.length === 0) {
          console.log(colors.muted('  No trusted peers.'));
        } else {
          for (const peer of trustedPeers) {
            console.log(`  ${colors.success('●')} ${peer.name || 'Unknown'}`);
            console.log(`    Fingerprint: ${colors.muted(peer.fingerprint)}`);
            console.log(`    Added: ${new Date(peer.addedAt).toLocaleDateString()}`);
          }
        }
      }

      if (!this.trusted && revokedFingerprints.length > 0) {
        console.log(colors.cyan('\nRevoked Peers:'));
        for (const fp of revokedFingerprints) {
          console.log(`  ${colors.error('●')} ${colors.muted(fp)}`);
        }
      }

      console.log(colors.muted(`\nTotal: ${trustedPeers.length} trusted, ${revokedFingerprints.length} revoked`));
      console.log();

      return 0;
    } catch (err: any) {
      error(`Failed to list peers: ${err.message}`);
      return 1;
    }
  }
}
