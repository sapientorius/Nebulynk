//! Local-only pairing policy. No UI, network or filesystem side effects.
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant, SystemTime};

pub const MODE_TTL: Duration = Duration::from_secs(120);
pub const REQUEST_TTL: Duration = Duration::from_secs(60);
pub const MAX_REQUESTS: usize = 4;
const MAX_ORIGINS: usize = 256;
const ORIGIN_RETENTION: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy)]
pub struct Moment {
    pub monotonic: Instant,
    pub wall: SystemTime,
}

impl Moment {
    pub fn now() -> Self {
        Self {
            monotonic: Instant::now(),
            wall: SystemTime::now(),
        }
    }
    #[cfg(test)]
    pub fn later(self, duration: Duration) -> Self {
        Self {
            monotonic: self.monotonic + duration,
            wall: self.wall + duration,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Deadline {
    start: Moment,
    duration: Duration,
}

impl Deadline {
    pub fn new(start: Moment, duration: Duration) -> Self {
        Self { start, duration }
    }
    pub fn expired(self, now: Moment) -> bool {
        now.monotonic
            .checked_duration_since(self.start.monotonic)
            .is_none_or(|d| d >= self.duration)
            || now
                .wall
                .duration_since(self.start.wall)
                .map_or(true, |d| d >= self.duration)
    }
    pub fn remaining(self, now: Moment) -> Duration {
        if self.expired(now) {
            return Duration::ZERO;
        }
        self.duration.saturating_sub(
            now.monotonic.duration_since(self.start.monotonic).max(
                now.wall
                    .duration_since(self.start.wall)
                    .unwrap_or(self.duration),
            ),
        )
    }
    pub fn wall_end(self) -> String {
        DateTime::<Utc>::from(self.start.wall + self.duration).to_rfc3339()
    }
}

pub struct TokenBucket {
    tokens: f64,
    capacity: f64,
    per_second: f64,
    last: Instant,
}

impl TokenBucket {
    pub fn new(per_minute: u32, burst: u32, now: Instant) -> Self {
        Self {
            tokens: burst as f64,
            capacity: burst as f64,
            per_second: per_minute as f64 / 60.0,
            last: now,
        }
    }
    pub fn take(&mut self, now: Instant) -> bool {
        let elapsed = now.checked_duration_since(self.last).unwrap_or_default();
        self.tokens = (self.tokens + elapsed.as_secs_f64() * self.per_second).min(self.capacity);
        if now >= self.last {
            self.last = now;
        }
        if self.tokens + f64::EPSILON < 1.0 {
            return false;
        }
        self.tokens = (self.tokens - 1.0).max(0.0);
        true
    }
}

struct OriginBucket {
    bucket: TokenBucket,
    used: Instant,
}
pub struct AttemptLimiter {
    global: TokenBucket,
    origins: HashMap<String, OriginBucket>,
}

impl AttemptLimiter {
    pub fn new(now: Instant) -> Self {
        Self {
            global: TokenBucket::new(30, 8, now),
            origins: HashMap::new(),
        }
    }
    fn expire(&mut self, now: Instant) {
        self.origins.retain(|_, entry| {
            now.checked_duration_since(entry.used).unwrap_or_default() < ORIGIN_RETENTION
        });
    }
    pub fn allow(&mut self, origin: &str, now: Instant) -> bool {
        // Charge the global bucket first: rotating names must not grow this map.
        if !self.global.take(now) {
            return false;
        }
        self.expire(now);
        if !self.origins.contains_key(origin) && self.origins.len() >= MAX_ORIGINS {
            if let Some(oldest) = self
                .origins
                .iter()
                .min_by_key(|(_, v)| v.used)
                .map(|(k, _)| k.clone())
            {
                self.origins.remove(&oldest);
            }
        }
        let entry = self
            .origins
            .entry(origin.to_string())
            .or_insert_with(|| OriginBucket {
                bucket: TokenBucket::new(6, 2, now),
                used: now,
            });
        entry.used = now;
        entry.bucket.take(now)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingRequest {
    pub request_id: String,
    pub connection_id: u64,
    pub origin: String,
    pub client_kind: String,
    pub created_at: String,
    pub expires_at: String,
    #[serde(skip)]
    epoch: String,
    #[serde(skip)]
    pub deadline: Deadline,
}

struct Mode {
    epoch: String,
    deadline: Deadline,
    last_wall: SystemTime,
}

pub struct PairingPolicy {
    mode: Option<Mode>,
    pub requests: Vec<PairingRequest>,
    rejected: HashSet<String>,
    pub attempts: AttemptLimiter,
}

impl PairingPolicy {
    pub fn new(now: Moment) -> Self {
        Self {
            mode: None,
            requests: Vec::new(),
            rejected: HashSet::new(),
            attempts: AttemptLimiter::new(now.monotonic),
        }
    }
    pub fn active(&self, now: Moment) -> bool {
        self.mode
            .as_ref()
            .is_some_and(|mode| !mode.deadline.expired(now) && now.wall >= mode.last_wall)
    }
    pub fn epoch(&self, now: Moment) -> Option<&str> {
        self.active(now)
            .then(|| self.mode.as_ref().unwrap().epoch.as_str())
    }
    pub fn expires_at(&self, now: Moment) -> Option<String> {
        self.active(now)
            .then(|| self.mode.as_ref().unwrap().deadline.wall_end())
    }
    pub fn start(&mut self, now: Moment) -> Result<(), &'static str> {
        if self.active(now) {
            return Err("Pairing mode is already active.");
        }
        self.stop();
        self.mode = Some(Mode {
            epoch: cuid2::create_id(),
            deadline: Deadline::new(now, MODE_TTL),
            last_wall: now.wall,
        });
        Ok(())
    }
    pub fn stop(&mut self) {
        self.mode = None;
        self.requests.clear();
        self.rejected.clear();
    }
    /// Returns whether mode closed and connection ids whose requests expired.
    pub fn tick(&mut self, now: Moment) -> (bool, Vec<u64>) {
        self.attempts.expire(now.monotonic);
        let was_open = self.mode.is_some();
        if was_open && !self.active(now) {
            let ids = self.requests.iter().map(|r| r.connection_id).collect();
            self.stop();
            return (true, ids);
        }
        if let Some(mode) = self.mode.as_mut() {
            mode.last_wall = now.wall;
        }
        let expired = self
            .requests
            .iter()
            .filter(|r| r.deadline.expired(now))
            .map(|r| r.connection_id)
            .collect();
        self.requests.retain(|r| !r.deadline.expired(now));
        (false, expired)
    }
    pub fn can_request(&self, origin: &str, now: Moment) -> Result<(), &'static str> {
        if !self.active(now) {
            return Err("pairing_mode_closed");
        }
        if self.rejected.contains(origin) {
            return Err("pairing_rejected");
        }
        if self.requests.len() >= MAX_REQUESTS || self.requests.iter().any(|r| r.origin == origin) {
            return Err("helper_limited");
        }
        Ok(())
    }
    pub fn request(
        &mut self,
        connection_id: u64,
        origin: String,
        client_kind: String,
        now: Moment,
    ) -> Result<PairingRequest, &'static str> {
        self.can_request(&origin, now)?;
        let mode = self.mode.as_ref().unwrap();
        let deadline = Deadline::new(now, REQUEST_TTL.min(mode.deadline.remaining(now)));
        let request = PairingRequest {
            request_id: cuid2::create_id(),
            connection_id,
            origin,
            client_kind,
            created_at: DateTime::<Utc>::from(now.wall).to_rfc3339(),
            expires_at: deadline.wall_end(),
            epoch: mode.epoch.clone(),
            deadline,
        };
        self.requests.push(request.clone());
        Ok(request)
    }
    pub fn validate(&self, id: &str, now: Moment) -> Result<PairingRequest, &'static str> {
        let mode = self
            .mode
            .as_ref()
            .filter(|_| self.active(now))
            .ok_or("pairing_mode_closed")?;
        self.requests
            .iter()
            .find(|r| r.request_id == id && r.epoch == mode.epoch && !r.deadline.expired(now))
            .cloned()
            .ok_or("pairing_expired")
    }
    pub fn reject(&mut self, id: &str, now: Moment) -> Result<PairingRequest, &'static str> {
        let request = self.validate(id, now)?;
        self.rejected.insert(request.origin.clone());
        self.remove_connection(request.connection_id);
        Ok(request)
    }
    pub fn remove_connection(&mut self, id: u64) -> bool {
        let before = self.requests.len();
        self.requests.retain(|r| r.connection_id != id);
        before != self.requests.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_mode_expires_without_request_extension_and_restarts_with_new_ids() {
        let now = Moment::now();
        let mut policy = PairingPolicy::new(now);
        assert!(!policy.active(now));
        assert_eq!(
            policy.can_request("https://one.example", now),
            Err("pairing_mode_closed")
        );
        policy.start(now).unwrap();
        let first = policy
            .request(1, "https://one.example".into(), "browser".into(), now)
            .unwrap();
        assert_eq!(
            policy.can_request(&first.origin, now),
            Err("helper_limited")
        );
        assert!(policy.start(now.later(Duration::from_secs(1))).is_err());
        assert!(policy
            .validate(&first.request_id, now.later(REQUEST_TTL))
            .is_err());
        policy.tick(now.later(REQUEST_TTL));
        let last = policy
            .request(
                2,
                "https://one.example".into(),
                "browser".into(),
                now.later(Duration::from_secs(110)),
            )
            .unwrap();
        assert_eq!(
            last.deadline.remaining(now.later(Duration::from_secs(110))),
            Duration::from_secs(10)
        );
        assert!(policy.tick(now.later(MODE_TTL)).0);
        policy.start(now.later(MODE_TTL)).unwrap();
        assert!(policy
            .validate(&last.request_id, now.later(MODE_TTL))
            .is_err());
    }
    #[test]
    fn rejection_is_origin_scoped_for_the_current_mode_and_pending_count_is_bounded() {
        let now = Moment::now();
        let mut policy = PairingPolicy::new(now);
        policy.start(now).unwrap();
        let first = policy
            .request(1, "https://one.example".into(), "browser".into(), now)
            .unwrap();
        policy.reject(&first.request_id, now).unwrap();
        assert_eq!(
            policy.can_request(&first.origin, now),
            Err("pairing_rejected")
        );
        for id in 2..6 {
            policy
                .request(id, format!("https://{id}.example"), "browser".into(), now)
                .unwrap();
        }
        assert_eq!(policy.requests.len(), MAX_REQUESTS);
        assert_eq!(
            policy.can_request("https://extra.example", now),
            Err("helper_limited")
        );
        policy.stop();
        policy.start(now).unwrap();
        assert!(policy.can_request(&first.origin, now).is_ok());
    }
    #[test]
    fn sleep_wall_time_and_backwards_clock_changes_close_mode() {
        let now = Moment::now();
        for changed in [
            Moment {
                monotonic: now.monotonic,
                wall: now.wall + MODE_TTL,
            },
            Moment {
                monotonic: now.monotonic + Duration::from_secs(1),
                wall: now.wall - Duration::from_secs(1),
            },
        ] {
            let mut policy = PairingPolicy::new(now);
            policy.start(now).unwrap();
            assert!(policy.tick(changed).0);
            assert!(!policy.active(changed));
        }
    }
    #[test]
    fn origin_rotation_cannot_bypass_global_budget_or_grow_limiter_without_bound() {
        let now = Moment::now();
        let mut limiter = AttemptLimiter::new(now.monotonic);
        let accepted = (0..10000)
            .filter(|i| limiter.allow(&format!("https://{i}.example"), now.monotonic))
            .count();
        assert_eq!(accepted, 8);
        assert_eq!(limiter.origins.len(), 8);
        for i in 0..1000 {
            limiter.allow(
                &format!("https://later-{i}.example"),
                now.monotonic + Duration::from_secs(i * 2),
            );
        }
        assert!(limiter.origins.len() <= MAX_ORIGINS);
        assert!(limiter.allow(
            "https://new.example",
            now.monotonic + Duration::from_secs(3000)
        ));
        assert_eq!(limiter.origins.len(), 1);
    }
    #[test]
    fn per_origin_burst_and_refill_are_independent_of_cache_hits() {
        let now = Instant::now();
        let mut limiter = AttemptLimiter::new(now);
        assert!(limiter.allow("https://one.example", now));
        assert!(limiter.allow("https://one.example", now));
        assert!(!limiter.allow("https://one.example", now));
        assert!(limiter.allow("https://one.example", now + Duration::from_secs(10)));
    }
    #[test]
    fn idle_limiter_origins_expire_during_backend_maintenance_even_with_mode_closed() {
        let now = Moment::now();
        let mut policy = PairingPolicy::new(now);
        assert!(policy.attempts.allow("https://one.example", now.monotonic));
        assert!(!policy.active(now));
        assert_eq!(policy.attempts.origins.len(), 1);
        policy.tick(now.later(ORIGIN_RETENTION));
        assert!(policy.attempts.origins.is_empty());
    }
}
