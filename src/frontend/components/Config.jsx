// src/frontend/components/Config.jsx
import React, { useState, useEffect } from 'react';
import { 
  Stack, 
  Heading, 
  Button, 
  SectionMessage, 
  Form, 
  FormSection, 
  FormHeader, 
  Text, 
  Code, 
  Toggle, 
  Range, 
  Select, 
  Label, 
  Inline,
  Box,
  Strong // ✅ Added Strong for emphasis
} from '@forge/react';
import { invoke } from '@forge/bridge';

export default function Config({ context, onBack }) {
  // Config State
  const [config, setConfig] = useState({
    autoTag: true,
    autoCheck: true,
    ttl: 30,
    scope: 'current', 
    crossProjects: [] 
  });
  
  const [availableProjects, setAvailableProjects] = useState([]);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false); 
  const [seedResult, setSeedResult] = useState(null);

  useEffect(() => {
    invoke('getAllProjects').then(projs => {
      setAvailableProjects(projs.map(p => ({ label: `${p.name} (${p.key})`, value: p.key })));
    });

    invoke('getScannerConfig').then(savedConfig => {
      if (savedConfig) {
        setConfig(prev => ({
          ...prev, 
          ...savedConfig, 
          crossProjects: savedConfig.crossProjects || [],
          ttl: Number(savedConfig.ttl) || 30
        }));
      }
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
        await invoke('saveScannerConfig', config);
        setSaveSuccess(true);
    } catch(e) {
        console.error("Save failed", e);
    } finally {
        setSaving(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedResult(null); // Clear previous result
    try {
      const res = await invoke('seedDemoData', { projectKey: context.extension.project.key });
      setSeedResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setSeeding(false);
    }
  };

  const getSelectedProjects = () => {
    const selectedKeys = config.crossProjects || []; 
    return availableProjects.filter(p => selectedKeys.includes(p.value));
  };

  const isBusy = seeding || saving;

  return (
    <Stack space="large">
      <Inline spread="space-between" alignBlock="center">
        <Heading size="large">Settings</Heading>
        {/* Disable Back button while processing to prevent closing mid-operation */}
        {onBack && (
            <Button 
                appearance="subtle" 
                onClick={onBack} 
                isDisabled={isBusy}
            >
                Cancel
            </Button>
        )}
      </Inline>

      <Form>
        <FormSection>
          <FormHeader><Heading size="medium">Automation</Heading></FormHeader>
          
          <Stack space="medium">
            <Inline alignBlock="center" space="medium">
                <Toggle 
                isChecked={config.autoTag} 
                onChange={() => setConfig({...config, autoTag: !config.autoTag})} 
                />
                <Text>Enable AI Auto-Tagging</Text>
            </Inline>

            <Inline alignBlock="center" space="medium">
                <Toggle 
                isChecked={config.autoCheck} 
                onChange={() => setConfig({...config, autoCheck: !config.autoCheck})} 
                />
                <Text>Enable Background Watchdog</Text>
            </Inline>
          </Stack>
          
          <Box paddingBlockStart="medium">
             <Stack space="small">
                <Inline spread="space-between" alignBlock="center">
                    <Label label="Cache Memory (TTL)" />
                    <Code>{config.ttl} Days</Code>
                </Inline>
                <Text>
                    Define how long vector embeddings are stored before regeneration.
                </Text>
                <Range 
                    value={config.ttl} 
                    min={1} 
                    max={90} 
                    step={1} 
                    onChange={(val) => setConfig({...config, ttl: val})} 
                />
             </Stack>
          </Box>
        </FormSection>

        <FormSection>
          <FormHeader><Heading size="medium">Scan Scope</Heading></FormHeader>
          
          <Stack space="medium">
            <Select
                appearance="default"
                options={[
                { label: "Current Project Only", value: "current" },
                { label: "Cross-Project (Global)", value: "cross" }
                ]}
                value={{ label: config.scope === 'cross' ? "Cross-Project (Global)" : "Current Project Only", value: config.scope }}
                onChange={(opt) => setConfig({...config, scope: opt.value})}
            />

            {config.scope === 'cross' && (
                <Stack space="small">
                <Label label="Select Target Projects" />
                <Select
                    isMulti
                    options={availableProjects}
                    value={getSelectedProjects()}
                    onChange={(opts) => setConfig({...config, crossProjects: opts.map(o => o.value)})}
                    placeholder="Select projects..."
                />
                </Stack>
            )}
          </Stack>
        </FormSection>

        {/* Distinct Visual Separation for Developer Zone */}
        <Box paddingBlock="large">
            <SectionMessage appearance="info" title="Developer Zone">
                <Stack space="small">
                    <Text>Generate sample data in <Code>{context?.extension?.project?.key}</Code> to test detection.</Text>
                    <Inline>
                        <Button 
                            appearance="warning" 
                            onClick={handleSeed} 
                            isDisabled={isBusy} 
                            isLoading={seeding}
                        >
                            Generate Demo Data
                        </Button>
                    </Inline>
                    
                    {/* ✅ Active Generation Message */}
                    {seeding && (
                       <Box padding="small" backgroundColor="neutral">
                          <Text>
                             <Strong>Creating tickets...</Strong> This usually takes about 10-20 seconds. 
                             Please keep this window open until the process completes.
                          </Text>
                       </Box>
                    )}

                    {/* ✅ Success Message for Judges */}
                    {seedResult && !seeding && (
                        <SectionMessage appearance="confirmation" title="Data Generation Complete">
                            <Text>
                                Successfully created <Strong>{seedResult.createdCount} sample issues</Strong>. 
                                These issues contain similar content to test the Duplicate Detection engine.
                                You can now click on <Strong>start sync</Strong> with current project as the settings to scan these issues for duplicates.
                            </Text>
                        </SectionMessage>
                    )}
                </Stack>
            </SectionMessage>
        </Box>

        {/* Primary Save Action at the bottom */}
        <Stack space="medium">
            <Button 
                appearance="primary" 
                onClick={handleSave} 
                isLoading={saving}
                isDisabled={isBusy} 
            >
                {saving ? 'Saving Changes...' : 'Save Configuration'}
            </Button>
            
            {saveSuccess && (
                <SectionMessage appearance="confirmation">
                    <Text>Configuration saved successfully.</Text>
                </SectionMessage>
            )}
        </Stack>

      </Form>
    </Stack>
  );
}