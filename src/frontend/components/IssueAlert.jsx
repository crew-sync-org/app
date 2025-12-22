// src/frontend/components/IssueAlert.jsx
import React, { useEffect, useState } from 'react';
import { router, requestJira } from '@forge/bridge'; // ✅ Added requestJira
import {
  Stack,
  SectionMessage,
  SectionMessageAction,
  Text,
  Button,
  ButtonGroup,
  Inline,
  Badge,
  Strong,
  Em,
  Box,
  Spinner
} from '@forge/react';
import { invoke, showFlag } from '@forge/bridge';

export default function IssueAlert({ context }) {
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState(null);
  
  // ✅ New state to track if the current issue is already "Done"
  const [issueResolved, setIssueResolved] = useState(false);

  const issueKey = context.extension.issue.key;

  useEffect(() => {
    const fetchAlert = async () => {
      try {
        // 1. Check Issue Status FIRST
        const statusRes = await requestJira(`/rest/api/3/issue/${issueKey}?fields=status`);
        const statusData = await statusRes.json();
        const isDone = statusData.fields?.status?.statusCategory?.key === 'done';
        setIssueResolved(isDone);

        // 2. Fetch Alerts
        const result = await invoke('checkWatchdogAlert', { issueKey });
        setAlert(result);
        setError(null);

        // 3. Show Toast ONLY if issue is NOT done
        if (result && result.length > 0) {
          if (!isDone) {
            showFlag({
              id: 'duplicate-alert-toast',
              title: 'Potential Duplicates Detected',
              description: `CrewSync found ${result.length} similar issue(s).`,
              type: 'warning',
              isAutoDismiss: true,
            });
          } else {
            console.log('Issue is resolved. Suppressing duplicate warning toast.');
          }
        }
      } catch (err) {
        setError('Failed to check for duplicates. Please refresh the page.');
        console.error('Error fetching alert:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlert();
  }, [issueKey]);

  // Manual Scan
  const handleManualScan = async () => {
    setScanning(true);
    try {
      const result = await invoke('analyzeCurrentIssue', { issueKey });
      setAlert(result);
      
      if (result && result.length > 0) {
          showFlag({
            id: 'manual-scan-success',
            title: 'Duplicates Found',
            description: `Scan complete. Found ${result.length} potential matches.`,
            type: 'warning',
            isAutoDismiss: true,
          });
      } else {
          showFlag({
            id: 'manual-scan-clean',
            title: 'No Duplicates',
            description: 'Scan complete. No conflicts found.',
            type: 'success',
            isAutoDismiss: true,
          });
      }
    } catch (err) {
      console.error('Scan failed:', err);
      setError('Manual scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const handleDismiss = async (matchKey) => {
    setActionLoading(prev => ({ ...prev, [matchKey]: 'dismiss' }));

    try {
      await invoke('ignoreCandidate', {
        sourceKey: issueKey,
        targetKey: matchKey
      });

      setAlert(prev => {
        const remaining = prev.filter(m => m.key !== matchKey);
        return remaining.length > 0 ? remaining : null;
      });
    } catch (err) {
      console.error('Error dismissing candidate:', err);
      setError('Failed to dismiss. Please try again.');
    } finally {
      setActionLoading(prev => {
        const updated = { ...prev };
        delete updated[matchKey];
        return updated;
      });
    }
  };

  const handleResolve = async (matchKey) => {
    setActionLoading(prev => ({ ...prev, [matchKey]: 'resolve' }));

    try {
      await invoke('linkAndResolve', {
        keepIssueKey: matchKey,
        closeIssueKey: issueKey
      });

      showFlag({
        id: 'resolve-success',
        title: 'Issue Resolved',
        description: `${issueKey} marked as duplicate of ${matchKey}.`,
        type: 'success',
        isAutoDismiss: true
      });

      // Reload to reflect status change
      setTimeout(() => window.location.reload(), 1500);

    } catch (err) {
      console.error('Error resolving duplicate:', err);
      setError('Failed to mark as duplicate. Please try again.');
    } finally {
      setActionLoading(prev => {
        const updated = { ...prev };
        delete updated[matchKey];
        return updated;
      });
    }
  };

  const getBadgeAppearance = (percentage) => {
    if (percentage >= 90) return 'important';
    if (percentage >= 75) return 'added';
    return 'default';
  };

  if (loading) {
    return (
      <SectionMessage appearance="info">
        <Text>Checking for duplicate issues...</Text>
      </SectionMessage>
    );
  }

  if (error) {
    return (
      <SectionMessage
        appearance="error"
        title="Error"
        actions={
          <SectionMessageAction onClick={() => window.location.reload()}>
            Retry
          </SectionMessageAction>
        }
      >
        <Text>{error}</Text>
      </SectionMessage>
    );
  }

  if (!alert || alert.length === 0) {
    return (
      <Stack space="medium">
        <SectionMessage appearance="confirmation" title="No Duplicates Found">
          <Text>
            CrewSync AI found no conflicts for this issue. Your backlog is clean!
          </Text>
        </SectionMessage>

        <Box padding="medium" backgroundColor="neutral">
          <Inline spread="space-between" alignBlock="center">
            <Text>Not scanned yet? Run a deep check now.</Text>
            <Button 
              appearance="primary" 
              onClick={handleManualScan} 
              isLoading={scanning}
              iconBefore={scanning ? undefined : "search"}
            >
              {scanning ? "Scanning..." : "Scan for Duplicates"}
            </Button>
          </Inline>
        </Box>
      </Stack>
    );
  }

  // Duplicates detected
  return (
    <Stack space="medium">
      {/* ✅ Logic Update: Different Message if Issue is Resolved */}
      {issueResolved ? (
        <SectionMessage appearance="info" title="Previous Scan Results">
          <Text>
            This issue is already marked as <Strong>Done</Strong>. These are the duplicates that were previously detected.
          </Text>
        </SectionMessage>
      ) : (
        <SectionMessage
          appearance="warning"
          title={`${alert.length} Potential Duplicate${alert.length > 1 ? 's' : ''} Detected`}
        >
          <Text>
            This issue appears similar to existing tickets. Review and resolve duplicates to maintain a clean backlog.
          </Text>
        </SectionMessage>
      )}

      {alert.map((match) => {
        const percentage = match.confidence || Math.round(match.score * 100);
        const isProcessing = actionLoading[match.key];

        return (
          <Box key={match.key} padding="medium" backgroundColor="neutral">
            <Stack space="small">
              <Inline spread="space-between" alignBlock="center">
                <Inline space="small" alignBlock="center">
                  <Text>Similar to:</Text>
                  
                  <Button 
                    appearance="link" 
                    spacing="none" 
                    onClick={() => router.open(`/browse/${match.key}`)}
                  >
                    <Strong>{match.key}</Strong>
                  </Button>
                  <Text>(Opens in new tab)</Text>

                </Inline>
                <Badge appearance={getBadgeAppearance(percentage)}>
                  {percentage}% Match
                </Badge>
              </Inline>

              {match.summary && (
                <Text>
                  <Em>{match.summary}</Em>
                </Text>
              )}

              {/* Only show action buttons if issue is NOT resolved (optional, but safer) 
                  However, user said "display previous results", usually implies read-only. 
                  But they might want to link it even if closed. Keeping buttons enabled 
                  but strictly logic is above. */}
              <ButtonGroup>
                <Button
                  appearance="primary"
                  onClick={() => handleResolve(match.key)}
                  isDisabled={isProcessing || issueResolved} // ✅ Disable 'Mark as Duplicate' if already resolved
                  isLoading={isProcessing === 'resolve'}
                >
                  {issueResolved ? 'Already Resolved' : 'Mark as Duplicate'}
                </Button>
                <Button
                  appearance="subtle"
                  onClick={() => handleDismiss(match.key)}
                  isDisabled={isProcessing}
                  isLoading={isProcessing === 'dismiss'}
                >
                  {issueResolved ? 'Dismiss' : 'Not a Duplicate'}
                </Button>
              </ButtonGroup>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}