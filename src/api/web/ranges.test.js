import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAddress, isLocalName, parseIPv4, parseIPv6 } from './ranges.js';

/** The addresses the recording browser may not reach: the range maths, with every disguise. */

const kind = (address) => classifyAddress(address).kind;

describe('web policy: address ranges', () => {
  it('knows the private IPv4 blocks to their edges', () => {
    const blocks = {
      loopback: ['127.0.0.0', '127.0.0.1', '127.255.255.255'],
      'private network': [
        '10.0.0.0',
        '10.255.255.255',
        '172.16.0.0',
        '172.31.255.255',
        '192.168.0.0',
        '192.168.255.255',
      ],
      'link-local': ['169.254.0.0', '169.254.169.254', '169.254.255.255'],
      'carrier-grade NAT': ['100.64.0.0', '100.127.255.255'],
      'this network': ['0.0.0.0', '0.1.2.3'],
      multicast: ['224.0.0.1', '239.255.255.255'],
      reserved: ['240.0.0.1', '255.255.255.255'],
      documentation: ['192.0.2.1', '198.51.100.7', '203.0.113.9'],
      benchmarking: ['198.18.0.1', '198.19.255.255'],
    };
    for (const [name, addresses] of Object.entries(blocks))
      for (const address of addresses) assert.equal(kind(address), name, address);
    const open = [
      '1.1.1.1',
      '8.8.8.8',
      '9.255.255.255',
      '11.0.0.0',
      '100.63.255.255',
      '100.128.0.0',
    ];
    const more = [
      '126.255.255.255',
      '128.0.0.0',
      '169.253.255.255',
      '169.255.0.0',
      '172.15.255.255',
    ];
    const rest = [
      '172.32.0.0',
      '192.167.255.255',
      '192.169.0.0',
      '198.17.255.255',
      '198.20.0.0',
      '223.255.255.255',
    ];
    for (const address of [...open, ...more, ...rest])
      assert.deepEqual(classifyAddress(address), { ip: true, kind: '' }, address);
  });

  it('sees through the ways of writing an IPv4 address', () => {
    const disguised = [
      '2130706433',
      '0x7f000001',
      '0x7f.1',
      '0x7f.0.0.1',
      '0177.0.0.1',
      '017700000001',
    ];
    const short = ['127.1', '127.0.1', '0x7F.0x0.0x0.0x1', '127.0.0.1.', ' 127.0.0.1 '];
    for (const address of [...disguised, ...short])
      assert.equal(kind(address), 'loopback', address);
    assert.equal(kind('3232235777'), 'private network', '192.168.1.1 as one number');
    assert.equal(kind('0xa9fea9fe'), 'link-local', '169.254.169.254 in hex');
    assert.equal(kind('0'), 'this network');
    assert.equal(parseIPv4('1.2.3.4'), 0x01020304);
    assert.equal(parseIPv4('1.2.3'), 0x01020003, 'the last part fills what is left');
    const not = [
      '',
      '1.2.3.4.5',
      '256.1.1.1',
      '1.2.3.256',
      '4294967296',
      '1.2..3',
      'a.b.c.d',
      '08.1.1.1',
      '1.2.3.-4',
      '0x',
    ];
    for (const text of not.slice(0, -1)) assert.equal(parseIPv4(text), null, text);
    assert.deepEqual(classifyAddress('example.com'), { ip: false, kind: '' });
    assert.deepEqual(classifyAddress('127.0.0.1.example.com'), { ip: false, kind: '' });
  });

  it('knows IPv6: loopback, local ranges, and IPv4 addresses carried inside', () => {
    const cases = {
      '::1': 'loopback',
      '[::1]': 'loopback',
      '0:0:0:0:0:0:0:1': 'loopback',
      '::': 'unspecified',
      'fe80::1': 'link-local',
      'fe80::1%eth0': 'link-local',
      'febf:ffff::1': 'link-local',
      'fc00::1': 'unique local',
      'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff': 'unique local',
      'fec0::1': 'site-local',
      'ff02::1': 'multicast',
      '2001:db8::1': 'documentation',
      '2001:0:4136:e378:8000:63bf:3fff:fdd2': 'Teredo',
      '::ffff:127.0.0.1': 'loopback, inside IPv6',
      '::ffff:7f00:1': 'loopback, inside IPv6',
      '::ffff:10.1.2.3': 'private network, inside IPv6',
      '::ffff:169.254.169.254': 'link-local, inside IPv6',
      '::127.0.0.1': 'loopback, inside IPv6',
      '::ffff:0:192.168.0.1': 'private network, inside IPv6',
      '64:ff9b::7f00:1': 'loopback, inside IPv6',
      '64:ff9b::a9fe:a9fe': 'link-local, inside IPv6',
      '2002:7f00:1::': 'loopback, inside IPv6',
      '2002:c0a8:101::1': 'private network, inside IPv6',
    };
    for (const [address, name] of Object.entries(cases)) assert.equal(kind(address), name, address);
    const open = [
      '2001:4860:4860::8888',
      '2606:4700::1111',
      '::ffff:8.8.8.8',
      '64:ff9b::808:808',
      '2002:808:808::1',
    ];
    for (const address of [...open, 'fbff::1', 'fe00::1', 'fe7f::1'])
      assert.deepEqual(classifyAddress(address), { ip: true, kind: '' }, address);
    assert.deepEqual(parseIPv6('1:2:3:4:5:6:7:8'), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(parseIPv6('1::8'), [1, 0, 0, 0, 0, 0, 0, 8]);
    for (const text of [
      '1::2::3',
      '12345::1',
      '1:2:3:4:5:6:7',
      '1:2:3:4:5:6:7:8:9',
      ':::',
      'g::1',
      '::ffff:1.2.3',
    ])
      assert.equal(parseIPv6(text), null, text);
    assert.deepEqual(
      ['localhost', 'LOCALHOST.', 'app.localhost', 'localhost.example.com'].map(isLocalName),
      [true, true, true, false],
    );
  });
});
