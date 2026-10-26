import { Callout, H1, H2, Pill, Row, Stack, Table, Text, useCanvasState, useHostTheme } from 'cursor/canvas';
import type { CSSProperties } from 'cursor/canvas';

type Kids = Parameters<typeof Stack>[0]['children'];

// Jade Court brand palette (apps/web/src/index.css). The mock app frame uses the
// product's fixed theme on purpose; the canvas chrome around it uses host tokens.
const J = {
  white: '#ffffff',
  cream: '#fbf3e1',
  cream2: '#f4e8ce',
  paper: '#fffdf6',
  ink: '#2b2622',
  inkSoft: '#5c5347',
  muted: '#94886f',
  line: '#e7dabc',
  red: '#d5452c',
  redDeep: '#ae3119',
  redSoft: '#f6d7cc',
  jade: '#1f9e81',
  jadeDeep: '#157a63',
  jadeSoft: '#d6efe7',
  gold: '#e7ac3f',
  goldDeep: '#a8740f',
  goldSoft: '#fbeac4',
};
const DISPLAY = "'Baloo 2', 'Nunito', system-ui, sans-serif";
const BODY = "'Nunito', system-ui, sans-serif";
const PIECE = "'Noto Serif SC', 'Songti SC', 'STSong', serif";

// --- Prototype model ---

type Variant = 'tabs' | 'emailFirst' | 'switchLink';
type Mode = 'signin' | 'register';
type Step = 'email' | 'password' | 'create' | 'oauthOnly';
type Outcome = 'new' | 'returning' | 'conflict';
type Provider = 'google' | 'facebook';
type Result =
  | { kind: 'signedIn'; via: 'email' | Provider; created: boolean; noEmail: boolean }
  | { kind: 'verifySent'; email: string };
type FormError = { text: string; signInInstead?: boolean };

/** Demo accounts: one with a password, one that only signs in with Google. */
const PASSWORD_ACCOUNT = 'dang@example.com';
const GOOGLE_ONLY_ACCOUNT = 'lan@example.com';

const VARIANTS: { id: Variant; label: string }[] = [
  { id: 'tabs', label: 'A · Tabs' },
  { id: 'emailFirst', label: 'B · Email first' },
  { id: 'switchLink', label: 'C · One form, switch link' },
];

const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: 'new', label: 'New to Jade Court' },
  { id: 'returning', label: 'Returning player' },
  { id: 'conflict', label: 'Email already registered' },
];

/** Copy from oauthErrorMessage() in apps/web/src/lib/oauthAuthApi.ts. */
const OAUTH_ERRORS: Record<string, string> = {
  email_exists_use_link:
    'An account with this email exists — sign in with your original method, then link Facebook from your account page.',
  email_taken: 'That email is already registered with a different sign-in method.',
};

// --- Jade Court primitives (mock app only) ---

type BtnKind = 'primary' | 'ghost' | 'dark' | 'text';

function JBtn({
  children,
  kind = 'primary',
  small,
  full,
  onClick,
}: {
  children: Kids;
  kind?: BtnKind;
  small?: boolean;
  full?: boolean;
  onClick?: () => void;
}) {
  const base: CSSProperties = {
    fontFamily: BODY,
    fontWeight: 800,
    fontSize: small ? 13 : 15,
    borderRadius: 999,
    padding: small ? '7px 14px' : '11px 22px',
    cursor: 'pointer',
    border: '1px solid transparent',
    width: full ? '100%' : undefined,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    whiteSpace: 'nowrap',
  };
  const kinds: Record<BtnKind, CSSProperties> = {
    primary: { background: J.jade, color: J.white },
    ghost: { background: J.white, color: J.ink, borderColor: J.line },
    dark: { background: J.ink, color: J.cream },
    text: { background: 'transparent', color: J.jadeDeep, padding: small ? '2px 4px' : '4px 6px' },
  };
  return (
    <button type="button" onClick={onClick} style={{ ...base, ...kinds[kind] }}>
      {children}
    </button>
  );
}

function JPill({ children, tone = 'jade' }: { children: Kids; tone?: 'jade' | 'gold' }) {
  const tones = {
    jade: { background: J.jadeSoft, color: J.jadeDeep },
    gold: { background: J.goldSoft, color: J.goldDeep },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        fontWeight: 800,
        fontSize: 12.5,
        padding: '5px 12px',
        borderRadius: 999,
        width: 'fit-content',
        ...tones[tone],
      }}
    >
      {children}
    </span>
  );
}

function JMuted({ children, size = 13, center }: { children: Kids; size?: number; center?: boolean }) {
  return (
    <div style={{ fontSize: size, fontWeight: 700, color: J.muted, textAlign: center ? 'center' : undefined }}>
      {children}
    </div>
  );
}

function JField({
  label,
  value,
  onChange,
  type = 'text',
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 800, color: J.inkSoft }}>
      <span>
        {label} {required && <span style={{ color: J.redDeep }}>*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 14,
          padding: '11px 14px',
          borderRadius: 12,
          border: `2px solid ${J.line}`,
          background: J.cream,
          color: J.ink,
        }}
      />
      {hint && <span style={{ fontSize: 12, fontWeight: 700, color: J.muted }}>{hint}</span>}
    </label>
  );
}

function JAlert({ children, tone = 'error' }: { children: Kids; tone?: 'error' | 'info' }) {
  const t = tone === 'error' ? { bg: J.redSoft, fg: J.redDeep } : { bg: J.jadeSoft, fg: J.jadeDeep };
  return (
    <div
      role="alert"
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        background: t.bg,
        color: t.fg,
        fontWeight: 800,
        fontSize: 13.5,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

function OrDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
      <div style={{ flex: 1, height: 1, background: J.line }} />
      <span style={{ fontSize: 11.5, fontWeight: 800, color: J.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: J.line }} />
    </div>
  );
}

// Brand marks copied from GoogleSignInButton.tsx / FacebookSignInButton.tsx.
function GoogleMark() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  );
}

function SocialButtons({ onSocial, only }: { onSocial: (p: Provider) => void; only?: Provider }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {only !== 'facebook' && (
        <JBtn kind="ghost" full onClick={() => onSocial('google')}>
          <GoogleMark /> Continue with Google
        </JBtn>
      )}
      {only !== 'google' && (
        <JBtn kind="ghost" full onClick={() => onSocial('facebook')}>
          <FacebookMark /> Continue with Facebook
        </JBtn>
      )}
    </div>
  );
}

function AuthCard({ children }: { children: Kids }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        boxSizing: 'border-box',
        background: J.paper,
        border: `1px solid ${J.line}`,
        borderRadius: 20,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function CardHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 24, lineHeight: 1.15 }}>{title}</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: J.muted, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// --- App chrome: browser frame + top bar ---

function BrowserFrame({ path, children }: { path: string; children: Kids }) {
  const theme = useHostTheme();
  return (
    <div style={{ border: `1px solid ${theme.stroke.secondary}`, borderRadius: 10, overflow: 'hidden' }}>
      <div
        style={{
          padding: '6px 12px',
          background: theme.bg.chrome,
          borderBottom: `1px solid ${theme.stroke.tertiary}`,
          color: theme.text.tertiary,
          fontSize: 12,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        jadecourt.app{path}
      </div>
      <div style={{ background: J.cream, color: J.ink, fontFamily: BODY }}>{children}</div>
    </div>
  );
}

function Topbar({ signedIn }: { signedIn: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 22px',
        borderBottom: `1px solid ${J.line}`,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            background: J.red,
            color: J.white,
            display: 'grid',
            placeItems: 'center',
            fontFamily: PIECE,
            fontWeight: 900,
            fontSize: 20,
          }}
        >
          象
        </div>
        <div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, lineHeight: 1 }}>Jade Court</div>
          <div style={{ fontSize: 10, color: J.muted, fontWeight: 800, letterSpacing: '0.14em' }}>XIANGQI</div>
        </div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {['Home', 'Play with AI', 'Play vs Computer', 'Play with Friends', 'News'].map((label) => (
          <span key={label} style={{ fontWeight: 700, fontSize: 13.5, padding: '7px 12px', color: J.inkSoft }}>
            {label}
          </span>
        ))}
        <span style={{ marginLeft: 8 }}>
          {signedIn ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px 4px 4px',
                borderRadius: 999,
                background: J.white,
                border: `1px solid ${J.line}`,
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  background: J.jade,
                  color: J.white,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                }}
              >
                DT
              </span>
              Dang
            </span>
          ) : (
            <JBtn kind="dark" small>
              Sign in
            </JBtn>
          )}
        </span>
      </div>
    </div>
  );
}

// --- Shared email form for variants A and C ---

function EmailForm({
  mode,
  setMode,
  onResult,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  onResult: (r: Result) => void;
}) {
  const [email, setEmail] = useCanvasState('email', '');
  const [password, setPassword] = useCanvasState('password', '');
  const [name, setName] = useCanvasState('displayName', '');
  const [error, setError] = useCanvasState<FormError | null>('formError', null);

  const submit = () => {
    const e = email.trim().toLowerCase();
    if (mode === 'signin') {
      if (!e || !password) return setError({ text: 'Enter your email and password.' });
      if (e !== PASSWORD_ACCOUNT) return setError({ text: 'Invalid email or password.' });
      setError(null);
      return onResult({ kind: 'signedIn', via: 'email', created: false, noEmail: false });
    }
    if (!name.trim() || !e || !password) return setError({ text: 'Enter your display name, email, and password.' });
    if (password.length < 8) return setError({ text: 'Use a password of at least 8 characters.' });
    if (e === PASSWORD_ACCOUNT || e === GOOGLE_ONLY_ACCOUNT) {
      return setError({ text: 'That email is already registered.', signInInstead: true });
    }
    setError(null);
    onResult({ kind: 'verifySent', email: e });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {mode === 'register' && <JField label="Display name" value={name} onChange={setName} required />}
      <JField label="Email" type="email" value={email} onChange={setEmail} required={mode === 'register'} />
      <JField
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        required={mode === 'register'}
        hint={mode === 'register' ? 'At least 8 characters' : undefined}
      />
      {mode === 'signin' && (
        <div style={{ textAlign: 'right', marginTop: -4 }}>
          <JBtn kind="text" small>
            Forgot password?
          </JBtn>
        </div>
      )}
      {error && (
        <JAlert>
          {error.text}
          {error.signInInstead && (
            <span>
              {' '}
              <span
                onClick={() => {
                  setError(null);
                  setPassword('');
                  setMode('signin');
                }}
                style={{ textDecoration: 'underline', cursor: 'pointer' }}
              >
                Sign in instead
              </span>
            </span>
          )}
        </JAlert>
      )}
      <JBtn kind="primary" full onClick={submit}>
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </JBtn>
      {mode === 'register' && (
        <JMuted size={12} center>
          We'll email you a link to verify your address.
        </JMuted>
      )}
    </div>
  );
}

// --- Variant A: tabs ---

function TabsVariant({
  mode,
  setMode,
  onSocial,
  onResult,
  oauthError,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  onSocial: (p: Provider) => void;
  onResult: (r: Result) => void;
  oauthError: string | null;
}) {
  const [, setError] = useCanvasState<FormError | null>('formError', null);
  return (
    <AuthCard>
      <div role="tablist" style={{ display: 'flex', gap: 4, background: J.cream2, borderRadius: 999, padding: 4 }}>
        {(
          [
            ['signin', 'Sign in'],
            ['register', 'Create account'],
          ] as const
        ).map(([id, label]) => (
          <span
            key={id}
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              setError(null);
              setMode(id);
            }}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 0',
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 14,
              cursor: 'pointer',
              background: mode === id ? J.ink : 'transparent',
              color: mode === id ? J.cream : J.inkSoft,
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <CardHeading
        title={mode === 'signin' ? 'Welcome back' : 'Join Jade Court'}
        sub={
          mode === 'signin'
            ? 'Save progress and pick up your games on any device.'
            : 'Free to join — your games sync when you sign in.'
        }
      />
      {oauthError && <JAlert>{OAUTH_ERRORS[oauthError]}</JAlert>}
      <SocialButtons onSocial={onSocial} />
      <OrDivider label={mode === 'signin' ? 'or sign in with email' : 'or create account with email'} />
      <EmailForm mode={mode} setMode={setMode} onResult={onResult} />
    </AuthCard>
  );
}

// --- Variant C: one form, switch link at the bottom ---

function SwitchLinkVariant({
  mode,
  setMode,
  onSocial,
  onResult,
  oauthError,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  onSocial: (p: Provider) => void;
  onResult: (r: Result) => void;
  oauthError: string | null;
}) {
  const [, setError] = useCanvasState<FormError | null>('formError', null);
  const toggle = () => {
    setError(null);
    setMode(mode === 'signin' ? 'register' : 'signin');
  };
  return (
    <AuthCard>
      <CardHeading
        title={mode === 'signin' ? 'Sign in' : 'Create account'}
        sub={
          mode === 'signin'
            ? 'Save progress and pick up your games on any device.'
            : 'Free to join — your games sync when you sign in.'
        }
      />
      {oauthError && <JAlert>{OAUTH_ERRORS[oauthError]}</JAlert>}
      <SocialButtons onSocial={onSocial} />
      <OrDivider label="or with email" />
      <EmailForm mode={mode} setMode={setMode} onResult={onResult} />
      <div style={{ textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: J.muted }}>
        {mode === 'signin' ? 'No account yet? ' : 'Already have an account? '}
        <JBtn kind="text" small onClick={toggle}>
          {mode === 'signin' ? 'Create one' : 'Sign in'}
        </JBtn>
      </div>
    </AuthCard>
  );
}

// --- Variant B: email first, then password or registration ---

function EmailFirstVariant({
  step,
  setStep,
  onSocial,
  onResult,
  oauthError,
}: {
  step: Step;
  setStep: (s: Step) => void;
  onSocial: (p: Provider) => void;
  onResult: (r: Result) => void;
  oauthError: string | null;
}) {
  const [email, setEmail] = useCanvasState('email', '');
  const [password, setPassword] = useCanvasState('password', '');
  const [name, setName] = useCanvasState('displayName', '');
  const [error, setError] = useCanvasState<FormError | null>('formError', null);
  const normalized = email.trim().toLowerCase();

  const go = (next: Step) => {
    setError(null);
    setPassword('');
    setStep(next);
  };

  const continueWithEmail = () => {
    if (!normalized) return setError({ text: 'Enter your email.' });
    if (normalized === PASSWORD_ACCOUNT) return go('password');
    if (normalized === GOOGLE_ONLY_ACCOUNT) return go('oauthOnly');
    go('create');
  };

  const signIn = () => {
    if (!password) return setError({ text: 'Enter your password.' });
    onResult({ kind: 'signedIn', via: 'email', created: false, noEmail: false });
  };

  const create = () => {
    if (!name.trim() || !password) return setError({ text: 'Enter your display name and password.' });
    if (password.length < 8) return setError({ text: 'Use a password of at least 8 characters.' });
    onResult({ kind: 'verifySent', email: normalized });
  };

  const emailChip = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 8px 8px 14px',
        borderRadius: 999,
        background: J.cream2,
        fontWeight: 800,
        fontSize: 13.5,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalized}</span>
      <span style={{ marginLeft: 'auto' }}>
        <JBtn kind="text" small onClick={() => go('email')}>
          Change
        </JBtn>
      </span>
    </div>
  );

  const titles: Record<Step, [string, string]> = {
    email: ['Sign in or create an account', 'One step for both. New here? We will set you up.'],
    password: ['Welcome back', 'Enter your password to continue.'],
    create: ['Create your account', "Looks like you're new to Jade Court."],
    oauthOnly: ['Welcome back', 'This account signs in with Google.'],
  };

  return (
    <AuthCard>
      <CardHeading title={titles[step][0]} sub={titles[step][1]} />
      {oauthError && <JAlert>{OAUTH_ERRORS[oauthError]}</JAlert>}

      {step === 'email' && (
        <>
          <SocialButtons onSocial={onSocial} />
          <OrDivider label="or continue with email" />
          <JField label="Email" type="email" value={email} onChange={setEmail} />
          {error && <JAlert>{error.text}</JAlert>}
          <JBtn kind="primary" full onClick={continueWithEmail}>
            Continue
          </JBtn>
        </>
      )}

      {step === 'password' && (
        <>
          {emailChip}
          <JField label="Password" type="password" value={password} onChange={setPassword} />
          <div style={{ textAlign: 'right', marginTop: -4 }}>
            <JBtn kind="text" small>
              Forgot password?
            </JBtn>
          </div>
          {error && <JAlert>{error.text}</JAlert>}
          <JBtn kind="primary" full onClick={signIn}>
            Sign in
          </JBtn>
        </>
      )}

      {step === 'create' && (
        <>
          {emailChip}
          <JField label="Display name" value={name} onChange={setName} required />
          <JField
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            required
            hint="At least 8 characters"
          />
          {error && <JAlert>{error.text}</JAlert>}
          <JBtn kind="primary" full onClick={create}>
            Create account
          </JBtn>
          <JMuted size={12} center>
            We'll email you a link to verify your address.
          </JMuted>
        </>
      )}

      {step === 'oauthOnly' && (
        <>
          {emailChip}
          <JAlert tone="info">You created this account with Google, so it has no password. Continue with Google.</JAlert>
          <SocialButtons onSocial={onSocial} only="google" />
          <JMuted size={12} center>
            Want a password too? Add one from your account page after you sign in.
          </JMuted>
        </>
      )}
    </AuthCard>
  );
}

// --- Where the page lands after a successful sign-in or sign-up ---

function ResultScreen({ result, onReset }: { result: Result; onReset: () => void }) {
  if (result.kind === 'verifySent') {
    return (
      <AuthCard>
        <JPill>Account created</JPill>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22 }}>Check your email</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: J.inkSoft, lineHeight: 1.5 }}>
          We sent a verification link to <b>{result.email}</b>. You're signed in already. Verify to unlock purchases
          and password reset.
        </div>
        <JBtn kind="ghost" onClick={onReset}>
          Back to the sign-in page
        </JBtn>
      </AuthCard>
    );
  }
  const via = { email: 'email', google: 'Google', facebook: 'Facebook' }[result.via];
  return (
    <AuthCard>
      <JPill tone={result.created ? 'gold' : 'jade'}>{result.created ? `New account · ${via}` : `Signed in · ${via}`}</JPill>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 22 }}>
        {result.created ? 'Welcome to Jade Court, Dang' : 'Welcome back, Dang'}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: J.inkSoft, lineHeight: 1.5 }}>
        {result.created
          ? `Your account was created from your ${via} profile. No separate sign-up step.`
          : 'Taking you back to where you were (the ?next= page, or Play).'}
      </div>
      {result.noEmail && (
        <JAlert tone="info">
          Facebook didn't share a verified email. Add one from your account page to get receipts and reset your
          password.
        </JAlert>
      )}
      <JBtn kind="ghost" onClick={onReset}>
        Back to the sign-in page
      </JBtn>
    </AuthCard>
  );
}

// --- Design notes per variant (canvas chrome) ---

const NOTES: Record<Variant, { summary: string; rows: [string, string, string][] }> = {
  tabs: {
    summary:
      'One card with a Sign in / Create account switch at the top. Closest to today, and each mode stays obvious at a glance.',
    rows: [
      ['URL', '/login shows Sign in; /login?mode=register opens the Create account tab. Back button and shared links keep working', 'App.tsx: /register redirects to /login?mode=register'],
      ['Google / Facebook', 'Same buttons in both tabs. The first OAuth sign-in already creates the account, so "Continue with…" fits either way', 'Reuse OAuthSignInButtons; divider label changes per tab'],
      ['Switching tabs', 'Keeps the email you typed, clears errors', 'One AuthScreen replaces LoginScreen + RegisterScreen'],
      ['Email already registered', 'Create account error gets a "Sign in instead" link that flips the tab with the email kept', 'Handles email_taken from POST /api/auth/register'],
      ['OAuth errors', 'Shown at the top of whichever tab is open', '?oauth_error= on /login (callback redirect target)'],
    ],
  },
  emailFirst: {
    summary:
      'Ask for the email first, then show password (existing account), registration fields (new email), or a Google button (account has no password).',
    rows: [
      ['Fewest decisions', 'Players never pick "sign in" vs "sign up"; the email decides', 'New AuthScreen with a step state'],
      ['Account lookup', 'Needs a call that tells whether an email has an account and which sign-in methods it uses', 'New endpoint, e.g. POST /api/auth/email-status'],
      ['Security tradeoff', 'That lookup reveals which emails are registered (account enumeration). Login and forgot-password avoid this today', 'Rate limit per IP; or skip variant B'],
      ['Google-only accounts', 'Instead of a confusing "invalid password", tells the player to continue with Google', 'Uses identities from the lookup'],
      ['Google / Facebook', 'Shown on the first step only', 'Reuse OAuthSignInButtons'],
    ],
  },
  switchLink: {
    summary:
      'Today\'s two cards merged into one. The bottom link swaps the mode in place instead of navigating to another page.',
    rows: [
      ['Smallest change', 'Same layout players know; just no page change', 'Merge the two screens; keep the existing tests mostly as they are'],
      ['URL', 'Same as variant A: ?mode=register', 'App.tsx redirect for /register'],
      ['Discoverability', 'The Create account path sits below the form, so it is easier to miss than tabs', 'None'],
      ['Google / Facebook', 'One set of buttons for both modes', 'Reuse OAuthSignInButtons'],
    ],
  },
};

// --- Canvas root ---

export default function CombinedAuthPrototype() {
  const theme = useHostTheme();
  const [variant, setVariant] = useCanvasState<Variant>('variant', 'tabs');
  const [outcome, setOutcome] = useCanvasState<Outcome>('outcome', 'new');
  const [mode, setMode] = useCanvasState<Mode>('mode', 'signin');
  const [step, setStep] = useCanvasState<Step>('step', 'email');
  const [result, setResult] = useCanvasState<Result | null>('result', null);
  const [oauthError, setOauthError] = useCanvasState<string | null>('oauthError', null);
  const [, setError] = useCanvasState<FormError | null>('formError', null);
  const [, setPassword] = useCanvasState('password', '');

  const reset = () => {
    setResult(null);
    setOauthError(null);
    setError(null);
    setPassword('');
    setStep('email');
  };

  const changeVariant = (v: Variant) => {
    reset();
    setMode('signin');
    setVariant(v);
  };

  const changeMode = (m: Mode) => {
    setOauthError(null);
    setMode(m);
  };

  // Simulates the IdP round trip: /api/auth/:provider/start → callback → back to the app.
  const onSocial = (p: Provider) => {
    setError(null);
    if (outcome === 'conflict') {
      setOauthError(p === 'facebook' ? 'email_exists_use_link' : 'email_taken');
      setMode('signin');
      setStep('email');
      return;
    }
    setOauthError(null);
    setResult({ kind: 'signedIn', via: p, created: outcome === 'new', noEmail: p === 'facebook' && outcome === 'new' });
  };

  const path = result
    ? result.kind === 'verifySent'
      ? '/register/sent'
      : '/play'
    : oauthError
      ? `/login?oauth_error=${oauthError}`
      : variant !== 'emailFirst' && mode === 'register'
        ? '/login?mode=register'
        : '/login';

  const notes = NOTES[variant];

  return (
    <Stack gap={18} style={{ padding: 4 }}>
      <Stack gap={6}>
        <H1>Combined Sign in and Create account page</H1>
        <Text tone="secondary">
          Clickable mockup in the Jade Court look. One page replaces /login and /register. Pick a layout, then try
          the form and the Google and Facebook buttons.
        </Text>
      </Stack>

      <Stack gap={10}>
        <Row gap={8} wrap align="center">
          <Text size="small" tone="tertiary">
            Layout:
          </Text>
          {VARIANTS.map((v) => (
            <Pill key={v.id} active={v.id === variant} onClick={() => changeVariant(v.id)}>
              {v.label}
            </Pill>
          ))}
        </Row>
        <Row gap={8} wrap align="center">
          <Text size="small" tone="tertiary">
            Google / Facebook returns:
          </Text>
          {OUTCOMES.map((o) => (
            <Pill key={o.id} size="sm" active={o.id === outcome} onClick={() => setOutcome(o.id)}>
              {o.label}
            </Pill>
          ))}
        </Row>
        <Text size="small" tone="tertiary">
          Demo emails: {PASSWORD_ACCOUNT} has a password (any password signs in). {GOOGLE_ONLY_ACCOUNT} only uses
          Google. Any other email counts as new.
        </Text>
      </Stack>

      <BrowserFrame path={path}>
        <Topbar signedIn={result !== null} />
        <div style={{ padding: '32px 20px 40px', display: 'flex', justifyContent: 'center' }}>
          {result ? (
            <ResultScreen result={result} onReset={reset} />
          ) : variant === 'tabs' ? (
            <TabsVariant mode={mode} setMode={changeMode} onSocial={onSocial} onResult={setResult} oauthError={oauthError} />
          ) : variant === 'emailFirst' ? (
            <EmailFirstVariant step={step} setStep={setStep} onSocial={onSocial} onResult={setResult} oauthError={oauthError} />
          ) : (
            <SwitchLinkVariant mode={mode} setMode={changeMode} onSocial={onSocial} onResult={setResult} oauthError={oauthError} />
          )}
        </div>
      </BrowserFrame>

      <Stack gap={10}>
        <H2>How this layout behaves</H2>
        <Text tone="secondary">{notes.summary}</Text>
        <Table
          headers={['Element', 'Behavior', 'What changes in the code']}
          rows={notes.rows.map(([el, behavior, code]) => [
            <Text weight="semibold">{el}</Text>,
            behavior,
            <span style={{ fontSize: 12.5, color: theme.text.secondary }}>{code}</span>,
          ])}
        />
      </Stack>

      <Callout tone="info" title="How Google and Facebook work on one page">
        The server already creates an account the first time someone continues with Google or Facebook
        (resolveOAuthUser in apps/server/src/auth/oauth/linking.ts). So the same two buttons cover sign-in and
        sign-up, and no server change is needed for layouts A or C. Facebook sign-ups don't keep the Facebook email,
        and a Facebook email that matches an existing account is rejected with email_exists_use_link. Switch the
        outcome to Email already registered to see that message.
      </Callout>
    </Stack>
  );
}
