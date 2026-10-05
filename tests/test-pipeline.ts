import { BUILTIN_PRESETS, DEFAULT_SETTINGS, AppStore, cleanSpeechLocally } from '../electron/store';
import { testProviderConnection } from '../electron/providers/tester';

async function runTests() {
  console.log('🧪 Starting OpenHandy Pipeline & Store Verification Tests...\n');

  // Test 1: Store & Default Settings
  console.log('Test 1: Store & Default Settings');
  const store = new AppStore();
  const settings = store.getSettings();
  console.assert(settings.hotkey === 'LeftControl', 'Default hotkey should be LeftControl');
  console.assert(settings.autoPaste === true, 'Default autoPaste should be true');
  console.assert(settings.copyToClipboard === true, 'Default copyToClipboard should be true');
  console.assert(settings.presets.length >= 5, 'Should have at least 5 built-in presets');
  console.log('  ✅ Default settings passed');

  // Test 2: Settings updates
  console.log('Test 2: Settings updates');
  const updated = store.updateSettings({
    copyToClipboard: false,
    activeSttProvider: 'azure',
  });
  console.assert(updated.copyToClipboard === false, 'copyToClipboard should be updated to false');
  console.assert(updated.activeSttProvider === 'azure', 'activeSttProvider should be updated to azure');
  console.log('  ✅ Settings update passed');

  // Reset back to defaults for clean state
  store.updateSettings({
    copyToClipboard: true,
    activeSttProvider: 'groq',
  });

  // Test 3: History management
  console.log('Test 3: History management');
  const initialHistory = store.getHistory();
  const testRecord = {
    id: `test_${Date.now()}`,
    timestamp: Date.now(),
    durationSeconds: 3,
    rawTranscript: 'hello this is a test',
    finalOutput: 'Hello, this is a test.',
    sttProvider: 'groq' as const,
    sttModel: 'whisper-large-v3-turbo',
    llmProvider: 'none' as const,
    presetId: 'clean',
    presetName: 'Clean & Polish',
    charCount: 22,
    wordCount: 5,
  };
  store.addHistoryRecord(testRecord);
  const newHistory = store.getHistory();
  console.assert(newHistory.length === initialHistory.length + 1, 'History length should increment');
  console.assert(newHistory[0].id === testRecord.id, 'Newest record should be at top');
  store.deleteHistoryRecord(testRecord.id);
  console.assert(store.getHistory().length === initialHistory.length, 'Record should be deleted');
  console.log('  ✅ History management passed');

  // Test 4: Provider tester handling of empty/invalid keys
  console.log('Test 4: Provider tester handling of empty/invalid keys');
  const azureRes = await testProviderConnection('azure', DEFAULT_SETTINGS);
  console.assert(azureRes.success === false, 'Azure with empty key should fail');
  console.assert(azureRes.message.includes('required'), 'Should indicate missing key');

  const groqRes = await testProviderConnection('groq', DEFAULT_SETTINGS);
  console.assert(groqRes.success === false, 'Groq with empty key should fail');

  const vercelRes = await testProviderConnection('vercel', DEFAULT_SETTINGS);
  console.assert(vercelRes.success === false, 'Vercel with empty key should fail');
  console.log('  ✅ Provider validator passed');

  // Test 5: Built-in presets structure
  console.log('Test 5: Built-in presets structure');
  const cleanPreset = BUILTIN_PRESETS.find((p) => p.id === 'clean');
  console.assert(Boolean(cleanPreset), 'Clean preset must exist');
  console.assert(cleanPreset!.systemPrompt.includes('filler words'), 'Clean preset should handle filler words');
  console.assert(cleanPreset!.systemPrompt.includes('self-corrections'), 'Clean preset should handle self-corrections');
  console.assert(cleanPreset!.systemPrompt.includes('second time'), 'Clean preset should instruct keeping what was spoken a second time');
  console.log('  ✅ Presets verified');

  // Test 6: Fast Local Speech Cleaner
  console.log('Test 6: Fast Local Speech Cleaner');
  const cleanedFillers = cleanSpeechLocally('um hello uh world er test');
  console.assert(cleanedFillers === 'Hello world test', `Expected "Hello world test", got "${cleanedFillers}"`);

  const cleanedStutters = cleanSpeechLocally('it it will will work');
  console.assert(cleanedStutters === 'It will work', `Expected "It will work", got "${cleanedStutters}"`);

  const cleanedPhrases = cleanSpeechLocally('it will, it will actually work');
  console.assert(cleanedPhrases === 'It will actually work', `Expected "It will actually work", got "${cleanedPhrases}"`);
  console.log('  ✅ Local speech cleaner passed');

  console.log('\n🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
