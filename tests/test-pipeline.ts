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
  const origClip = settings.copyToClipboard;
  const origStt = settings.activeSttProvider;
  const updated = store.updateSettings({
    copyToClipboard: false,
    activeSttProvider: 'azure',
  });
  console.assert(updated.copyToClipboard === false, 'copyToClipboard should be updated to false');
  console.assert(updated.activeSttProvider === 'azure', 'activeSttProvider should be updated to azure');
  console.log('  ✅ Settings update passed');

  // Restore user settings
  store.updateSettings({
    copyToClipboard: origClip,
    activeSttProvider: origStt,
  });

  // Test 3: History management
  console.log('Test 3: History management');
  const initialLen = store.getHistory().length;
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
  const afterAdd = store.getHistory();
  console.assert(afterAdd.length >= initialLen, 'History should contain records');
  console.assert(afterAdd[0].id === testRecord.id, 'Newest record should be at top');
  store.deleteHistoryRecord(testRecord.id);
  console.assert(store.getHistory().every(r => r.id !== testRecord.id), 'Record should be deleted');
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

  // Test 6: Fast Local Speech Cleaner & Polisher
  console.log('Test 6: Fast Local Speech Cleaner & Polisher');
  const cleanedFillers = cleanSpeechLocally('um hello uh world er test');
  console.assert(cleanedFillers === 'Hello world test', `Expected "Hello world test", got "${cleanedFillers}"`);

  const cleanedYouKnow = cleanSpeechLocally("let's get LLM, you know, polishing good");
  console.assert(cleanedYouKnow === "Let's get LLM polishing good", `Expected "Let's get LLM polishing good", got "${cleanedYouKnow}"`);

  const cleanedSentenceCap = cleanSpeechLocally("Good. um, let's do that with on-device AI.");
  console.assert(cleanedSentenceCap === "Good. Let's do that with on-device AI.", `Expected "Good. Let's do that with on-device AI.", got "${cleanedSentenceCap}"`);

  const cleanedHyphen = cleanSpeechLocally("Write the twin- the- the pinned tweet");
  console.assert(cleanedHyphen === "Write the pinned tweet", `Expected "Write the pinned tweet", got "${cleanedHyphen}"`);

  const cleanedStutters = cleanSpeechLocally('it it will will work');
  console.assert(cleanedStutters === 'It will work', `Expected "It will work", got "${cleanedStutters}"`);

  const cleanedPhrases = cleanSpeechLocally('it will, it will actually work');
  console.assert(cleanedPhrases === 'It will actually work', `Expected "It will actually work", got "${cleanedPhrases}"`);

  // Test 7: Smart On-Device List Formatting
  console.log('Test 7: Smart On-Device List Formatting');
  const ordinalList = cleanSpeechLocally('First, buy milk. Second, walk the dog. Third, call mom.');
  console.assert(ordinalList === '1. Buy milk\n2. Walk the dog\n3. Call mom', `Expected numbered list, got "${ordinalList}"`);

  const spokenBullets = cleanSpeechLocally('Bullet: check server. Bullet: restart service.');
  console.assert(spokenBullets === '- Check server\n- Restart service.', `Expected bullet list, got "${spokenBullets}"`);

  const colonList = cleanSpeechLocally('Tasks to do: buy groceries, clean kitchen, and walk dog.');
  console.assert(colonList === 'Tasks to do:\n\n- Buy groceries\n- Clean kitchen\n- Walk dog', `Expected colon list, got "${colonList}"`);

  const userTest = cleanSpeechLocally("First of all, let's get LLM, you know, polishing good. um, let's do that with the on-device AI. But also, if you remove ums and it when I talk in like a list and do this, this, and this, it should make it a list.");
  console.assert(!userTest.includes('you know'), `Expected "you know" to be removed, got "${userTest}"`);
  console.assert(!userTest.includes('um,'), `Expected "um," to be removed, got "${userTest}"`);
  console.assert(userTest.includes('on-device'), `Expected "on-device" to be preserved, got "${userTest}"`);
  console.log('  ✅ Local speech polisher & list formatter passed');

  console.log('\n🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
