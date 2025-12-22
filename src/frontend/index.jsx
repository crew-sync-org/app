import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Spinner, Stack, Text } from '@forge/react';
import { view } from '@forge/bridge';
import PitWall from './components/PitWall';
import IssueAlert from './components/IssueAlert';
import Config from './components/Config';

function App() {
  const [context, setContext] = useState(null);
  const [currentView, setCurrentView] = useState('default'); // 'default' or 'settings'

  useEffect(() => {
    view.getContext().then(setContext);
  }, []);

  if (!context) {
    return (
      <Stack align="center" space="small">
        <Spinner />
        <Text>Initializing CrewSync...</Text>
      </Stack>
    );
  }

  // 1. If we are in the "Issue Panel" (inside a ticket), always show Alert
  if (context.moduleKey === 'crewsync-issue-panel') {
    return <IssueAlert context={context} />;
  }

  // 2. If we are in the "Pit Wall" (sidebar), handle navigation
  if (context.moduleKey === 'crewsync-pit-wall') {
    if (currentView === 'settings') {
      return (
        <Config 
          context={context} 
          onBack={() => setCurrentView('default')} 
        />
      );
    }
    return (
      <PitWall 
        context={context} 
        onSettings={() => setCurrentView('settings')} 
      />
    );
  }

  // Fallback for standard settings page module
  return <Config context={context} />;
}

ForgeReconciler.render(<App />);