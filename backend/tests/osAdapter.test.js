const osAdapter = require('../osAdapter');
const security = require('../security');
const services = require('../services');

describe('Enterprise OS Detection & Command Abstraction Engine', () => {
  test('Host OS detection returns valid non-empty fields', () => {
    expect(osAdapter.OS_ID).toBeTruthy();
    expect(osAdapter.OS_FAMILY).toMatch(/^(debian|rhel|alpine|arch|unknown)$/);
    expect(typeof osAdapter.isSystemdAvailable()).toBe('boolean');

    const info = osAdapter.getOsInfo();
    expect(info).toHaveProperty('osId');
    expect(info).toHaveProperty('osFamily');
    expect(info).toHaveProperty('systemd');
  });

  test('Parses AlmaLinux 10 /etc/os-release content as RHEL family', () => {
    const almaRelease = `
NAME="AlmaLinux"
VERSION="10.0 (Seafoam)"
ID="almalinux"
ID_LIKE="rhel centos fedora"
VERSION_ID="10.0"
PLATFORM_ID="platform:el10"
PRETTY_NAME="AlmaLinux 10.0 (Seafoam)"
ANSI_COLOR="0;34"
LOGO="almalinux-logo"
CPE_NAME="cpe:/o:almalinux:almalinux:10::baseos"
HOME_URL="https://almalinux.org/"
    `.trim();

    const parsed = osAdapter.parseOsRelease(almaRelease);
    expect(parsed.id).toBe('almalinux');
    expect(parsed.versionId).toBe('10.0');
    expect(parsed.family).toBe('rhel');
    expect(parsed.prettyName).toBe('AlmaLinux 10.0 (Seafoam)');
  });

  test('Parses Ubuntu 24.04/26.04 /etc/os-release content as Debian family', () => {
    const ubuntuRelease = `
NAME="Ubuntu"
VERSION="24.04 LTS (Noble Numbat)"
ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu 24.04 LTS"
VERSION_ID="24.04"
    `.trim();

    const parsed = osAdapter.parseOsRelease(ubuntuRelease);
    expect(parsed.id).toBe('ubuntu');
    expect(parsed.versionId).toBe('24.04');
    expect(parsed.family).toBe('debian');
  });

  test('Parses Debian 12 /etc/os-release content as Debian family', () => {
    const debianRelease = `
PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
NAME="Debian GNU/Linux"
VERSION_ID="12"
VERSION="12 (bookworm)"
ID=debian
    `.trim();

    const parsed = osAdapter.parseOsRelease(debianRelease);
    expect(parsed.id).toBe('debian');
    expect(parsed.family).toBe('debian');
  });

  test('Parses CentOS Stream /etc/os-release content as RHEL family', () => {
    const centosRelease = `
NAME="CentOS Stream"
VERSION="9"
ID="centos"
ID_LIKE="rhel fedora"
VERSION_ID="9"
PRETTY_NAME="CentOS Stream 9"
    `.trim();

    const parsed = osAdapter.parseOsRelease(centosRelease);
    expect(parsed.id).toBe('centos');
    expect(parsed.family).toBe('rhel');
  });

  test('Normalizes firewalld output into standard rule structures', () => {
    const firewalldOutput = `
public (active)
  target: default
  icmp-block-inversion: no
  interfaces: eth0
  sources: 
  services: cockpit dhcpv6-client ssh
  ports: 80/tcp 443/tcp 8787/tcp
  protocols: 
  forward: yes
  masquerade: no
  forward-ports: 
  source-ports: 
  icmp-blocks: 
  rich rules: 
\trule family="ipv4" source address="192.168.1.100" port port="2222" protocol="tcp" accept
    `.trim();

    const rules = security.parseFirewalldList(firewalldOutput);
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThanOrEqual(6);

    // Assert normalized keys
    for (const r of rules) {
      expect(r).toHaveProperty('num');
      expect(r).toHaveProperty('to');
      expect(r).toHaveProperty('action');
      expect(r).toHaveProperty('from');
    }

    // Services normalized
    const sshSvc = rules.find(r => r.to.includes('ssh'));
    expect(sshSvc).toBeDefined();
    expect(sshSvc.action).toBe('ALLOW');

    // Ports normalized
    const port80 = rules.find(r => r.to === '80/tcp');
    expect(port80).toBeDefined();
    expect(port80.action).toBe('ALLOW');

    // Rich rule normalized
    const richRule = rules.find(r => r.to === '2222/tcp');
    expect(richRule).toBeDefined();
    expect(richRule.from).toBe('192.168.1.100');
    expect(richRule.action).toBe('ACCEPT');
  });

  test('Services module returns OS-appropriate unit mappings', () => {
    const managed = services.getManagedServices();
    expect(Array.isArray(managed)).toBe(true);
    expect(managed.length).toBeGreaterThan(0);

    const ssh = managed.find(s => s.id === 'ssh' || s.id === 'sshd');
    expect(ssh).toBeDefined();
    expect(ssh.unit).toMatch(/^(ssh\.service|sshd\.service)$/);

    const firewall = managed.find(s => s.id === 'ufw' || s.id === 'firewalld');
    expect(firewall).toBeDefined();
    expect(firewall.unit).toMatch(/^(ufw\.service|firewalld\.service)$/);
  });
});
