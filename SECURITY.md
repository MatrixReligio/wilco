<p align="center"><strong>English</strong> · <a href="SECURITY.zh-CN.md">简体中文</a></p>

# Security Policy

Wilco controls a coding agent that can read and change files on your computer, so we take security reports seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Report vulnerabilities privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**.

Please include:

- the affected component (relay, Pi extension, protocol, iOS app or Mac host) and version;
- a description of the issue and its impact;
- steps to reproduce or a proof of concept;
- any suggested fix.

We aim to acknowledge a report within 3 business days and to share a remediation plan within 14 days. We will credit you in the release notes unless you ask us not to.

## Scope

In scope: everything in this repository, the Wilco iOS app, the Wilco Mac host and the hosted Wilco relay. Out of scope: vulnerabilities in Pi itself (report those to the [Pi project](https://github.com/earendil-works/pi)), and denial-of-service through volume alone.

## Supported versions

Until version 1.0, only the latest release receives security fixes.

See [Security model](docs/en/security-model.md) for how Wilco protects your data.
