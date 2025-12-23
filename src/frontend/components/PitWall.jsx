// src/frontend/components/PitWall.jsx
import React, { useState } from 'react';
import {
  Stack, Heading, Button, Spinner, SectionMessage, DynamicTable,
  Text, Code, Badge, Inline, Modal, ModalHeader, ModalTitle, 
  ModalBody, ModalFooter, Strong, ButtonGroup, ProgressBar, 
  EmptyState, Box
} from '@forge/react';
import { invoke, router, showFlag } from '@forge/bridge';

export default function PitWall({ context, onSettings }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState([]);
  const [selectedPair, setSelectedPair] = useState(null);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [scanStats, setScanStats] = useState({ scanned: 0, total: 0 });
  const [scanPhase, setScanPhase] = useState('idle');

  // --- Helpers ---

  const openIssue = (key) => {
    router.open(`/browse/${key}`);
  };

  function inflateRows(scanPayload) {
    if (!scanPayload || !scanPayload.items) {
      console.warn('Invalid scan payload received');
      return [];
    }

    const items = scanPayload.items;
    const out = [];

    items.forEach(item => {
      if (!item.source || !item.source.key) return;

      const source = item.source;
      const dups = item.duplicates || [];

      dups.forEach(d => {
        if (!d.issue || !d.issue.key) return;

        // Use AI reason or fallback
        const aiReason = d.verdict?.reason 
          ? d.verdict.reason 
          : "AI detected high content similarity between these issues.";

        out.push({
          id: `${source.key}-${d.issue.key}`,
          source: {
            key: source.key,
            summary: source.summary || 'No summary',
            description: source.description || '' 
          },
          duplicate: {
            key: d.issue.key,
            summary: d.issue.fields?.summary || d.issue.summary || 'No summary',
            description: d.issue.fields?.description || d.issue.description || ''
          },
          confidence: d.verdict?.confidence || Math.round((d.score || 0) * 100),
          reason: aiReason,
        });
      });
    });
    return out;
  }

  // --- Main Actions ---

  async function runSync() {
    setLoading(true);
    setRows([]);
    setProgress(0);
    setError(null);
    setScanPhase('fetching');

    const TOTAL_TO_SCAN = 10;
    const BATCH_SIZE = 1;
    const batches = Math.ceil(TOTAL_TO_SCAN / BATCH_SIZE);

    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      setScanPhase('analyzing');
      setScanStats({ scanned: 0, total: TOTAL_TO_SCAN });

      for (let i = 0; i < batches; i++) {
        const currentProgress = i / batches;
        setProgress(currentProgress);
        setScanStats({ scanned: i + 1, total: TOTAL_TO_SCAN });

        try {
          const result = await invoke('scanBacklogBatch', {
            offset: i * BATCH_SIZE,
            limit: BATCH_SIZE,
            projectKey: context.extension.project.key
          });

          const newRows = inflateRows(result);
          if (newRows.length > 0) {
            setRows(prev => [...prev, ...newRows].sort((a, b) => b.confidence - a.confidence));
          }
        } catch (batchError) {
          console.error(`Batch ${i + 1} failed:`, batchError);
        }
      }

      setScanPhase('complete');
      setProgress(1);
    } catch (error) {
      console.error('Scan failed:', error);
      setError('Scan failed. Please check your configuration and try again.');
      setScanPhase('idle');
    } finally {
      setLoading(false);
    }
  }

  // Unified Resolve Logic
  async function executeResolution(keepKey, closeKey) {
    if (actionLoading) return;
    setActionLoading(true);

    try {
      await invoke('linkAndResolve', {
        keepIssueKey: keepKey,
        closeIssueKey: closeKey
      });

      showFlag({
        id: `resolve-${closeKey}`,
        title: 'Issue Resolved',
        description: `${closeKey} marked as duplicate of ${keepKey}.`,
        type: 'success',
        isAutoDismiss: true
      });

      setRows(prev => prev.filter(r => r.id !== selectedPair.id));
      setSelectedPair(null);

    } catch (error) {
      console.error('Resolve failed:', error);
      showFlag({
        id: `error-${closeKey}`,
        title: 'Action Failed',
        description: 'Could not resolve tickets. Please try again.',
        type: 'error'
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleIgnore() {
    if (!selectedPair || actionLoading) return;
    setActionLoading(true);
    try {
      await invoke('ignoreCandidate', {
        sourceKey: selectedPair.source.key,
        targetKey: selectedPair.duplicate.key
      });

      setRows(prev => prev.filter(r => r.id !== selectedPair.id));
      setSelectedPair(null);

      showFlag({
        id: 'ignore-success',
        title: 'Match Ignored',
        type: 'info',
        isAutoDismiss: true
      });

    } catch (error) {
      console.error('Ignore failed', error);
      showFlag({
        id: 'ignore-error',
        title: 'Error',
        description: 'Failed to ignore candidate.',
        type: 'error'
      });
    } finally {
      setActionLoading(false);
    }
  }

  // --- Table Configuration ---

  const head = {
    cells: [
      { key: 'source', content: 'Original Issue', isSortable: false, width: 30 },
      { key: 'match', content: 'Potential Duplicate', isSortable: false, width: 30 },
      { key: 'score', content: 'Confidence', isSortable: true, width: 15 },
      { key: 'action', content: '', isSortable: false, width: 25 },
    ]
  };

  const tableRows = rows.map(row => {
    const sourceSummary = row.source.summary || 'No summary';
    const dupSummary = row.duplicate.summary || 'No summary';

    return {
      key: row.id,
      cells: [
        {
          key: 'source',
          content: (
            <Stack space="small">
              <Button appearance="link" spacing="none" onClick={() => openIssue(row.source.key)}>
                {row.source.key}
              </Button>
              <Text>
                {sourceSummary.length > 50
                  ? `${sourceSummary.substring(0, 50)}...`
                  : sourceSummary}
              </Text>
            </Stack>
          )
        },
        {
          key: 'match',
          content: (
            <Stack space="small">
              <Button appearance="link" spacing="none" onClick={() => openIssue(row.duplicate.key)}>
                {row.duplicate.key}
              </Button>
              <Text>
                {dupSummary.length > 50
                  ? `${dupSummary.substring(0, 50)}...`
                  : dupSummary}
              </Text>
            </Stack>
          )
        },
        {
          key: 'score',
          content: (
            <Badge appearance={row.confidence > 85 ? 'added' : row.confidence > 70 ? 'primary' : 'default'}>
              {row.confidence}%
            </Badge>
          )
        },
        {
          key: 'action',
          content: (
            <Button
              appearance="primary"
              onClick={() => setSelectedPair(row)}
              spacing="compact"
            >
              Review
            </Button>
          )
        }
      ]
    };
  });

  return (
    <Stack space="large">
      {/* Header Section */}
      <Box
        padding="medium"
        backgroundColor="neutral"
        style={{
          borderRadius: '8px',
          border: '1px solid #DFE1E6'
        }}
      >
        <Inline spread="space-between" alignBlock="center">
          <Stack space="small">
            <Heading size="large">🏎️ Ticket Synchronizer</Heading>
            <Text appearance="subtle">
              AI-powered duplicate detection for <Code>{context.extension.project.key}</Code>
            </Text>
          </Stack>
          <Button
            appearance="subtle"
            iconBefore="settings"
            onClick={onSettings}
          >
            Settings
          </Button>
        </Inline>
      </Box>

      {/* Error Alert */}
      {error && (
        <SectionMessage appearance="error" title="Something went wrong">
          <Stack space="small">
            <Text>{error}</Text>
            <Button appearance="link" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </Stack>
        </SectionMessage>
      )}

      {/* Scan Control Section */}
      {(loading || rows.length > 0) && (
        <Box
          padding="medium"
          style={{
            borderRadius: '8px',
            border: '2px dashed #DFE1E6',
            backgroundColor: '#FAFBFC'
          }}
        >
          <Stack space="medium">
            <Box style={{ display: 'flex', justifyContent: 'center' }}>
              <Button
                appearance="primary"
                onClick={runSync}
                isDisabled={loading}
                iconBefore={loading ? undefined : "search"}
              >
                {loading ? 'Syncing...' : 'Start Sync'}
              </Button>
            </Box>

            {/* Progress Indicator */}
            {loading && (
              <Stack space="medium">
                <Box
                  padding="medium"
                  backgroundColor="neutral"
                  style={{
                    borderRadius: '8px',
                    border: '1px solid #0052CC',
                    backgroundColor: '#DEEBFF'
                  }}
                >
                  <Stack space="medium">
                    <Inline alignBlock="center" space="small">
                      <Spinner size="medium" />
                      <Text>
                        <Strong>
                          {scanPhase === 'fetching' && 'Fetching tickets from backlog...'}
                          {scanPhase === 'analyzing' && `Analyzing ticket ${scanStats.scanned} of ${scanStats.total}`}
                        </Strong>
                      </Text>
                    </Inline>

                    {scanPhase === 'analyzing' && (
                      <>
                        <ProgressBar value={progress} />
                        <Text appearance="subtle">
                          Using AI to compare issues and detect duplicates. This may take a few moments.
                        </Text>
                      </>
                    )}

                    {scanPhase === 'fetching' && (
                      <Text appearance="subtle">
                        Connecting to Jira API and retrieving recent issues...
                      </Text>
                    )}
                  </Stack>
                </Box>
              </Stack>
            )}
          </Stack>
        </Box>
      )}

      {/* Results Section */}
      {rows.length > 0 && (
        <Stack space="medium">
          <Box
            padding="medium"
            style={{
              borderRadius: '8px',
              backgroundColor: '#FFF4E5',
              border: '2px solid #FF991F'
            }}
          >
            <Inline alignBlock="center" space="small">
              <Text>⚠️</Text>
              <Heading size="medium">
                Found {rows.length} Potential Duplicate{rows.length !== 1 ? 's' : ''}
              </Heading>
            </Inline>
            <Text appearance="subtle">
              Review each match below and take appropriate action
            </Text>
          </Box>
          <DynamicTable head={head} rows={tableRows} />
        </Stack>
      )}

      {/* Empty States */}
      {!loading && scanPhase === 'complete' && rows.length === 0 && scanStats.scanned === 0 && (
        <EmptyState
          header="No tickets found in backlog"
          description="Your project backlog appears to be empty. You can generate demo tickets to test the scanner."
          imageUrl="https://via.placeholder.com/200x150?text=No+Tickets"
          primaryAction={
            <Button appearance="primary" onClick={onSettings} iconBefore="add">
              Generate Demo Tickets
            </Button>
          }
          secondaryAction={
            <Button appearance="subtle" onClick={runSync}>
              Retry Scan
            </Button>
          }
        />
      )}

      {!loading && scanPhase === 'complete' && rows.length === 0 && scanStats.scanned > 0 && (
        <Box
          padding="large"
          style={{
            borderRadius: '8px',
            backgroundColor: '#E3FCEF',
            border: '2px solid #00875A',
            textAlign: 'center'
          }}
        >
          <Stack space="medium" alignInline="center">
            <Text style={{ fontSize: '48px' }}>✅</Text>
            <Heading size="medium">Clean Backlog!</Heading>
            <Text>
      Your backlog appears clean! However, if you <Strong>just created</Strong> these tickets (within the last 5 minutes), 
      Jira may still be indexing them.
    </Text>
            <Text appearance="subtle">
              Scanned {scanStats.total} ticket{scanStats.total !== 1 ? 's' : ''}
            </Text>
            <Button appearance="subtle" onClick={runSync} iconBefore="refresh">
              Run Another Scan
            </Button>
          </Stack>
        </Box>
      )}

      {!loading && scanPhase === 'idle' && rows.length === 0 && !error && (
        <EmptyState
          header="Ready to synchronize"
          description="Click 'Start Sync' to analyze your backlog using AI-powered duplicate detection. The ticket synchronizer will compare issues based on their content and context."
          imageUrl="https://via.placeholder.com/200x150?text=Start+Sync"
          primaryAction={
            <Button appearance="primary" onClick={runSync} iconBefore="search">
              Start Sync
            </Button>
          }
        />
      )}

      {/* --- Review Modal --- */}
      {selectedPair && (
        <Modal onClose={() => !actionLoading && setSelectedPair(null)} width="xlarge">
          <ModalHeader>
            <ModalTitle>Review Duplicate Match</ModalTitle>
          </ModalHeader>

          <ModalBody>
            <Stack space="medium">
              
              {/* Confidence & Analysis Header */}
              {/* Updated Layout: Stack ensures Reason wraps to the next line naturally */}
              <Box
                padding="medium"
                style={{
                  borderRadius: '8px',
                  backgroundColor: selectedPair.confidence > 85 ? '#E3FCEF' : '#DEEBFF',
                  border: `2px solid ${selectedPair.confidence > 85 ? '#00875A' : '#0052CC'}`
                }}
              >
                <Stack space="small">
                  <Inline spread="space-between" alignBlock="center">
                    <Text><Strong>AI Confidence Score</Strong></Text>
                    <Badge 
                      appearance={selectedPair.confidence > 85 ? 'added' : 'primary'}
                      style={{ fontSize: '18px', padding: '8px 16px' }}
                    >
                      {selectedPair.confidence}%
                    </Badge>
                  </Inline>
                  {/* Reason Text: Now in a Stack below title, allowing full width wrapping */}
                  <Text>{selectedPair.reason}</Text>
                </Stack>
              </Box>

              {/* Side-by-Side Comparison */}
              {/* Updated Layout: spread="space-between" with explicit widths prevents overlap */}
              <Stack space="small">
                 <Inline spread="space-between" alignBlock="start">
                  
                  {/* LEFT: Original Ticket */}
                  <Box
                    padding="medium"
                    style={{
                      width: '48%', // Fixed width for separation
                      backgroundColor: '#F7F8F9',
                      borderRadius: '10px',
                      border: '2px solid #DCE6F9'
                    }}
                  >
                    <Stack space="medium">
                      <Button appearance="link" spacing="none" onClick={() => openIssue(selectedPair.source.key)}>
                        <Strong>{selectedPair.source.key}</Strong>
                      </Button>
                      <Stack space="small">
                        <Text><Strong>Summary</Strong></Text>
                        <Text>{selectedPair.source.summary}</Text>
                      </Stack>
                    </Stack>
                  </Box>

                  {/* RIGHT: Duplicate Ticket */}
                  <Box
                    padding="medium"
                    style={{
                      width: '48%', // Fixed width for separation
                      backgroundColor: '#FFFAE6',
                      borderRadius: '10px',
                      border: '2px solid #FFE7BA'
                    }}
                  >
                    <Stack space="medium">
                      <Button appearance="link" spacing="none" onClick={() => openIssue(selectedPair.duplicate.key)}>
                        <Strong>{selectedPair.duplicate.key}</Strong>
                      </Button>
                      <Stack space="small">
                        <Text><Strong>Summary</Strong></Text>
                        <Text>{selectedPair.duplicate.summary}</Text>
                      </Stack>
                    </Stack>
                  </Box>
                </Inline>
              </Stack>
            </Stack>
          </ModalBody>

          <ModalFooter>
             {/* 3 Buttons Footer */}
             <Inline spread="space-between" alignBlock="center">
                {/* 1. Ignore (Yellow) */}
                <Button
                  appearance="warning"
                  onClick={handleIgnore}
                  isDisabled={actionLoading}
                >
                  Ignore Match
                </Button>

                {/* Right Side Buttons: Grouped */}
                <ButtonGroup>
                   {/* 2. Link & Close Duplicate */}
                   <Button
                      onClick={() => executeResolution(selectedPair.source.key, selectedPair.duplicate.key)}
                      isDisabled={actionLoading}
                      appearance="primary"
                      style={{ backgroundColor: '#000000', borderColor: '#000000', color: 'white' }}
                   >
                      Link & Close {selectedPair.duplicate.key}
                   </Button>

                   {/* 3. Link & Close Original */}
                   <Button
                      onClick={() => executeResolution(selectedPair.duplicate.key, selectedPair.source.key)}
                      isDisabled={actionLoading}
                      appearance="primary"
                      style={{ backgroundColor: '#000000', borderColor: '#000000', color: 'white' }}
                   >
                      Link & Close {selectedPair.source.key}
                   </Button>
                </ButtonGroup>
             </Inline>
          </ModalFooter>
        </Modal>
      )}
    </Stack>
  );
}