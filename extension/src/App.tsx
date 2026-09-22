import { useEffect, useMemo, useState } from 'react';
import './App.css';
import type { CapturedField, Profile } from './types';

type Phase = 'idle' | 'capturing' | 'captured' | 'filling' | 'filled';

interface FillState {
  selector: string;
  status: 'pending' | 'filling' | 'filled' | 'failed';
  name: string;
  value: string;
}

interface ApiResponse {
  success?: boolean;
  error?: string;
  message?: string;
  profiles?: Profile[];
  profile?: Profile;
}

const API_BASE_URL = 'http://localhost:3000';

const LIVE_FIELDS_KEY = 'auto_listing_live_fields';

function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  const [capturedFields, setCapturedFields] = useState<CapturedField[]>([]);
  const [latestCapturedField, setLatestCapturedField] =
    useState<CapturedField | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');

  const [activeFillSelector, setActiveFillSelector] =
    useState<string | null>(null);

  const [fillStates, setFillStates] = useState<FillState[]>([]);

  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const [statusMessage, setStatusMessage] = useState('');

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  /* =========================================================
     LOAD PROFILES
  ========================================================= */

  useEffect(() => {
    loadProfiles();
  }, []);

  /* =========================================================
     LISTEN TO EXTENSION MESSAGES
  ========================================================= */

  useEffect(() => {
    const handleMessage = (message: ExtensionMessage) => {
      if (
        message.type === 'CAPTURE_UPDATE' ||
        message.type === 'CAPTURE_COMPLETE'
      ) {
        const fields = Array.isArray(message.fields) ? message.fields : [];

        setCapturedFields(fields);
        setLatestCapturedField(fields.at(-1) ?? null);

        if (message.type === 'CAPTURE_UPDATE') {
          setPhase('capturing');
        }

        if (message.type === 'CAPTURE_COMPLETE') {
          setPhase(fields.length > 0 ? 'captured' : 'idle');
        }
      }

      if (message.type === 'AUTOFILL_COMPLETE') {
        setRunning(false);
        setPhase('filled');
        setActiveFillSelector(null);

        if (typeof message.successCount === 'number') {
          setStatusMessage(
            `Auto listing completed: ${message.successCount}/${message.totalCount ?? 0} fields filled`,
          );
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  /* =========================================================
     LISTEN TO LIVE STORAGE
  ========================================================= */

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, ChromeStorageChange>,
    ) => {
      const change = changes[LIVE_FIELDS_KEY];

      if (!change) return;

      const fields = Array.isArray(change.newValue)
        ? (change.newValue as CapturedField[])
        : [];

      setCapturedFields(fields);

      if (fields.length > 0) {
        setLatestCapturedField(fields.at(-1) ?? null);

        if (phase === 'capturing') {
          setPhase('capturing');
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [phase]);

  /* =========================================================
     LOAD PROFILES
  ========================================================= */

  async function loadProfiles() {
    setLoadingProfiles(true);

    try {
      const response = await fetch(`${API_BASE_URL}/profiles`);

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data: ApiResponse = await response.json();

      if (data.success && Array.isArray(data.profiles)) {
        setProfiles(data.profiles);

        if (data.profiles.length > 0 && !selectedProfileId) {
          setSelectedProfileId(data.profiles[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
      setStatusMessage(
        'Could not connect to backend. Make sure NestJS is running.',
      );
    } finally {
      setLoadingProfiles(false);
    }
  }

  /* =========================================================
     START CAPTURE
  ========================================================= */

  async function startCapture() {
    try {
      setCapturedFields([]);
      setLatestCapturedField(null);
      setFillStates([]);
      setActiveFillSelector(null);
      setStatusMessage('');
      setPhase('capturing');

      await chrome.storage.local.set({
        [LIVE_FIELDS_KEY]: [],
      });

      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      const tabId = tabs[0]?.id;

      if (!tabId) {
        throw new Error('No active tab found');
      }

      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'START_CAPTURE',
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Could not start capture');
      }
    } catch (error) {
      console.error('Start capture failed:', error);

      setPhase('idle');
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Could not start capture',
      );
    }
  }

  /* =========================================================
     STOP CAPTURE
  ========================================================= */

  async function stopCapture() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      const tabId = tabs[0]?.id;

      if (!tabId) {
        throw new Error('No active tab found');
      }

      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'STOP_CAPTURE',
      });

      const fields = response?.fields ?? capturedFields;

      setCapturedFields(fields);
      setLatestCapturedField(fields.at(-1) ?? null);
      setPhase(fields.length > 0 ? 'captured' : 'idle');
      setStatusMessage(
        fields.length > 0
          ? `${fields.length} fields captured`
          : 'No fields captured',
      );
    } catch (error) {
      console.error('Stop capture failed:', error);

      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Could not stop capture',
      );
    }
  }

  /* =========================================================
     SAVE PROFILE TO BACKEND
  ========================================================= */

  async function saveProfile() {
    if (capturedFields.length === 0) {
      setStatusMessage('No fields captured yet.');
      return;
    }

    const profileName = window.prompt(
      'Enter profile name:',
      selectedProfile?.name ||
        `Meesho Profile ${new Date().toLocaleDateString()}`,
    );

    if (!profileName?.trim()) {
      return;
    }

    setSaving(true);
    setStatusMessage('Saving profile...');

    try {
      const response = await fetch(`${API_BASE_URL}/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: profileName.trim(),
          platform: 'meesho',
          fields: capturedFields.map((field) => ({
            name: field.name,
            value: field.value,
            selector: field.selector,
            tagName: field.tagName,
            type: field.type ?? '',
            placeholder: field.placeholder ?? '',
          })),
        }),
      });

      if (!response.ok) {
        const text = await response.text();

        throw new Error(
          `Backend returned ${response.status}${
            text ? `: ${text}` : ''
          }`,
        );
      }

      const data: ApiResponse = await response.json();

      if (!data.success || !data.profile) {
        throw new Error(data.error || 'Profile was not saved');
      }

      const savedProfile = data.profile;

      setProfiles((previous) => [
        savedProfile,
        ...previous.filter((profile) => profile.id !== savedProfile.id),
      ]);

      setSelectedProfileId(savedProfile.id);

      setStatusMessage(
        `Profile "${savedProfile.name}" saved successfully`,
      );

      setPhase('captured');
    } catch (error) {
      console.error('Save profile failed:', error);

      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Failed to save profile',
      );
    } finally {
      setSaving(false);
    }
  }

  /* =========================================================
     RUN AUTO LISTING
  ========================================================= */

  async function runAutoListing() {
    if (!selectedProfile) {
      setStatusMessage('Please select a profile first.');
      return;
    }

    if (selectedProfile.fields.length === 0) {
      setStatusMessage('Selected profile has no fields.');
      return;
    }

    try {
      setRunning(true);
      setPhase('filling');
      setStatusMessage('Auto listing is running...');

      const states: FillState[] = selectedProfile.fields.map((field) => ({
        selector: field.selector,
        status: 'pending',
        name: field.name,
        value: field.value,
      }));

      setFillStates(states);

      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      const tabId = tabs[0]?.id;

      if (!tabId) {
        throw new Error('No active tab found');
      }

      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'AUTOFILL',
        fields: selectedProfile.fields,
      });

      if (!response?.success) {
        throw new Error(
          response?.error || 'Autofill failed',
        );
      }

      if (response.response?.fields) {
        setCapturedFields(response.response.fields);
      }
    } catch (error) {
      console.error('Auto listing failed:', error);

      setRunning(false);
      setPhase('captured');

      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Auto listing failed',
      );
    }
  }

  /* =========================================================
     DELETE LOCAL PROFILE
  ========================================================= */

  function clearCapturedFields() {
    setCapturedFields([]);
    setLatestCapturedField(null);
    setStatusMessage('');
    setPhase('idle');

    void chrome.storage.local.set({
      [LIVE_FIELDS_KEY]: [],
    });
  }

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="app">

      {/* HEADER */}

      <header className="app-header">
        <div className="brand">
          <div className="brand-icon">AI</div>

          <div>
            <h1>Auto Listing AI</h1>
            <p>Smart product listing automation</p>
          </div>
        </div>

        <div className="connection-dot">
          <span />
          Connected
        </div>
      </header>

      {/* PROFILE SECTION */}

      <section className="panel profile-panel">

        <div className="panel-header">
          <div>
            <span className="section-label">PROFILE</span>
            <h2>Saved Profiles</h2>
          </div>

          <button
            className="refresh-button"
            onClick={loadProfiles}
            disabled={loadingProfiles}
            title="Refresh profiles"
          >
            ↻
          </button>
        </div>

        <div className="profile-select-wrapper">
          <select
            className="profile-select"
            value={selectedProfileId}
            onChange={(event) =>
              setSelectedProfileId(event.target.value)
            }
            disabled={loadingProfiles || profiles.length === 0}
          >
            {profiles.length === 0 ? (
              <option value="">
                No saved profiles
              </option>
            ) : (
              profiles.map((profile) => (
                <option
                  key={profile.id}
                  value={profile.id}
                >
                  {profile.name}
                </option>
              ))
            )}
          </select>
        </div>

        {selectedProfile && (
          <div className="profile-info">
            <div>
              <span>Platform</span>
              <strong>
                {selectedProfile.platform}
              </strong>
            </div>

            <div>
              <span>Fields</span>
              <strong>
                {selectedProfile.fields.length}
              </strong>
            </div>
          </div>
        )}

        <button
          className="primary-button run-button"
          onClick={runAutoListing}
          disabled={
            running ||
            !selectedProfile ||
            selectedProfile.fields.length === 0
          }
        >
          <span className="button-icon">▶</span>

          {running
            ? 'RUNNING AUTO LISTING...'
            : 'RUN AUTO LISTING'}
        </button>

      </section>

      {/* AUTO LISTING STATUS */}

      {(phase === 'filling' || phase === 'filled') &&
        fillStates.length > 0 && (
          <section className="panel filling-panel">

            <div className="panel-header">
              <div>
                <span className="section-label">
                  AUTO LISTING
                </span>

                <h2>
                  {phase === 'filled'
                    ? 'Listing Complete'
                    : 'Filling Fields'}
                </h2>
              </div>

              <div
                className={`phase-badge ${
                  phase === 'filled'
                    ? 'phase-complete'
                    : 'phase-running'
                }`}
              >
                {phase === 'filled'
                  ? '✓ DONE'
                  : '● RUNNING'}
              </div>
            </div>

            <div className="fill-list">

              {fillStates.map((field, index) => (
                <div
                  className={`fill-item ${
                    activeFillSelector === field.selector
                      ? 'fill-active'
                      : ''
                  }`}
                  key={`${field.selector}-${index}`}
                >

                  <div className="fill-number">
                    {index + 1}
                  </div>

                  <div className="fill-content">
                    <strong>{field.name}</strong>
                    <span>{field.value}</span>
                  </div>

                  <div
                    className={`fill-status fill-${field.status}`}
                  >
                    {field.status === 'filled' && '✓ Filled'}
                    {field.status === 'filling' && 'Filling...'}
                    {field.status === 'failed' && 'Failed'}
                    {field.status === 'pending' && 'Pending'}
                  </div>

                </div>
              ))}

            </div>

          </section>
        )}

      {/* CAPTURE SECTION */}

      <section className="panel capture-panel">

        <div className="panel-header">

          <div>
            <span className="section-label">
              FIELD CAPTURE
            </span>

            <h2>
              {phase === 'capturing'
                ? 'Live Capture'
                : 'Capture Product Fields'}
            </h2>
          </div>

          {phase === 'capturing' && (
            <div className="live-badge">
              <span />
              LIVE
            </div>
          )}

          {phase === 'captured' &&
            capturedFields.length > 0 && (
              <div className="captured-badge">
                ✓ CAPTURED
              </div>
            )}
        </div>

        {/* CAPTURE BUTTONS */}

        <div className="capture-actions">

          {phase !== 'capturing' ? (
            <button
              className="capture-button"
              onClick={startCapture}
              disabled={running}
            >
              <span className="record-dot" />
              START CAPTURE
            </button>
          ) : (
            <button
              className="stop-capture-button"
              onClick={stopCapture}
            >
              <span className="stop-square" />
              STOP & SAVE CAPTURE
            </button>
          )}

        </div>

        {/* CAPTURE FEED */}

        <div className="capture-feed">

          <div className="feed-header">
            <span>
              {phase === 'capturing'
                ? 'Captured right now'
                : 'Recorded fields'}
            </span>

            <strong>
              {capturedFields.length}
            </strong>
          </div>

          {latestCapturedField &&
            phase === 'capturing' && (
              <div className="latest-capture">

                <div className="latest-icon">
                  ✓
                </div>

                <div className="latest-content">
                  <span>Captured now</span>
                  <strong>
                    {latestCapturedField.name}
                  </strong>
                </div>

                <b>
                  {latestCapturedField.value}
                </b>

              </div>
            )}

          {capturedFields.length === 0 ? (
            <div className="empty-feed">
              <div className="empty-icon">
                +
              </div>

              <strong>
                Waiting for fields
              </strong>

              <span>
                Start capture and enter or select
                product information on Meesho.
              </span>
            </div>
          ) : (
            <div className="captured-list">

              {capturedFields.map(
                (field, index) => (
                  <div
                    className={`captured-item ${
                      phase === 'capturing' &&
                      latestCapturedField?.selector ===
                        field.selector
                        ? 'captured-active'
                        : ''
                    }`}
                    key={`${field.selector}-${index}`}
                  >

                    <div className="captured-check">
                      ✓
                    </div>

                    <div className="captured-content">
                      <strong>
                        {field.name}
                      </strong>

                      <span>
                        {field.value}
                      </span>
                    </div>

                    <span className="captured-status">
                      Captured
                    </span>

                  </div>
                ),
              )}

            </div>
          )}

        </div>

        {/* SAVE */}

        {capturedFields.length > 0 &&
          phase !== 'capturing' && (
            <div className="save-section">

              <button
                className="save-button"
                onClick={saveProfile}
                disabled={saving}
              >
                {saving
                  ? 'SAVING PROFILE...'
                  : 'SAVE RECORDED FIELDS'}
              </button>

              <button
                className="clear-button"
                onClick={clearCapturedFields}
                disabled={saving}
              >
                Clear
              </button>

            </div>
          )}

      </section>

      {/* STATUS */}

      {statusMessage && (
        <div
          className={`status-message ${
            statusMessage.toLowerCase().includes('fail') ||
            statusMessage.toLowerCase().includes('could not') ||
            statusMessage.toLowerCase().includes('error')
              ? 'status-error'
              : 'status-success'
          }`}
        >
          <span>
            {statusMessage.toLowerCase().includes('fail') ||
            statusMessage.toLowerCase().includes('could not') ||
            statusMessage.toLowerCase().includes('error')
              ? '!'
              : '✓'}
          </span>

          {statusMessage}
        </div>
      )}

      <footer>
        Auto Listing AI • Meesho Automation
      </footer>

    </div>
  );
}

export default App;