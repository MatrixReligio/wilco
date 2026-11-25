// The APNs request for a push: a sealed alert, or a Live Activity update.
import type { ActivityPush, AlertPush, Push } from './validate';

export interface APNsRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const HOSTS = { production: 'api.push.apple.com', sandbox: 'api.sandbox.push.apple.com' } as const;

export function apnsRequest(push: Push, topic: string, now: number): APNsRequest {
  const url = `https://${HOSTS[push.environment]}/3/device/${push.token}`;
  return push.kind === 'alert' ? alert(push, topic, url) : activity(push, topic, url, now);
}

function alert(push: AlertPush, topic: string, url: string): APNsRequest {
  const name = push.category.toUpperCase();
  const aps: Record<string, unknown> = {
    // Shown only if the device cannot open the sealed message in time.
    alert: { 'loc-key': `PUSH_FALLBACK_${name}` },
    'mutable-content': 1,
    // No buttons until the device has opened the message: its extension sets the real category.
    category: 'WILCO_UNOPENED',
    'thread-id': push.thread,
  };
  // A finished run is news, not an interruption.
  if (push.category !== 'finished') aps.sound = 'default';
  const headers: Record<string, string> = {
    'apns-push-type': 'alert',
    'apns-topic': topic,
    'apns-priority': push.category === 'finished' ? '5' : '10',
  };
  if (push.collapse) headers['apns-collapse-id'] = push.collapse;
  return { url, headers, body: JSON.stringify({ aps, w: push.sealed }) };
}

function activity(push: ActivityPush, topic: string, url: string, now: number): APNsRequest {
  const aps: Record<string, unknown> = { timestamp: now, event: push.event, 'content-state': push.state };
  if (push.staleAfter !== undefined) aps['stale-date'] = now + push.staleAfter;
  if (push.dismissAfter !== undefined) aps['dismissal-date'] = now + push.dismissAfter;
  return {
    url,
    headers: {
      'apns-push-type': 'liveactivity',
      'apns-topic': `${topic}.push-type.liveactivity`,
      // Apple budgets high-priority updates: only a question that waits is urgent.
      'apns-priority': push.state.needsApproval ? '10' : '5',
    },
    body: JSON.stringify({ aps }),
  };
}
