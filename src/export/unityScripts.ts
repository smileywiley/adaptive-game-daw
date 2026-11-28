/**
 * Generates the companion Unity 2022 LTS / Unity 6 C# Adaptive Music Player scripts
 * bundled inside the exported .zip package.
 */

export const ADAPTIVE_MUSIC_MANIFEST_CS = `using System;
using System.Collections.Generic;
using UnityEngine;

namespace TheoryDAW.AdaptiveMusic
{
    [Serializable]
    public class StemManifestEntry
    {
        public string stemId;
        public string name;
        public string fileName;
        public float intensityMin;
        public float intensityMax = 1f;
        public float volumeDb;
        [NonSerialized] public AudioClip clip;
    }

    [Serializable]
    public class SectionManifestEntry
    {
        public string id;
        public string name;
        public string role; // "loop" or "stinger"
        public int bars;
        public string transitionQuantization; // "next_beat", "next_bar", "phrase_4", "end_of_loop"
        public bool useTransitionFill;
        public bool keepBeatPosition; // Phase-locked Banjo-Kazooie style location swap
        public List<StemManifestEntry> stems = new List<StemManifestEntry>();
    }

    [Serializable]
    public class AdaptiveMusicManifestData
    {
        public string projectName;
        public float bpm = 110f;
        public string timeSignature = "4/4";
        public int beatsPerBar = 4;
        public List<SectionManifestEntry> sections = new List<SectionManifestEntry>();
    }

    [CreateAssetMenu(fileName = "AdaptiveMusicProfile", menuName = "TheoryDAW/Adaptive Music Profile")]
    public class AdaptiveMusicProfile : ScriptableObject
    {
        public TextAsset manifestJson;
        public List<AudioClip> stemClips = new List<AudioClip>();

        public AdaptiveMusicManifestData LoadManifest()
        {
            if (manifestJson == null) return null;
            var data = JsonUtility.FromJson<AdaptiveMusicManifestData>(manifestJson.text);
            if (data == null) return null;

            var clipLookup = new Dictionary<string, AudioClip>(StringComparer.OrdinalIgnoreCase);
            foreach (var clip in stemClips)
            {
                if (clip != null) clipLookup[clip.name] = clip;
            }

            foreach (var section in data.sections)
            {
                foreach (var stem in section.stems)
                {
                    string key = System.IO.Path.GetFileNameWithoutExtension(stem.fileName);
                    if (clipLookup.TryGetValue(key, out var found))
                    {
                        stem.clip = found;
                    }
                }
            }

            return data;
        }
    }
}
`;

export const ADAPTIVE_MUSIC_MANAGER_CS = `using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

namespace TheoryDAW.AdaptiveMusic
{
    /// <summary>
    /// Sample-accurate adaptive game music player for TheoryDAW exports.
    /// Supports synchronized vertical stem crossfading, quantized horizontal section switching,
    /// phase-locked location swaps (keepBeatPosition), and one-shot stingers.
    /// </summary>
    public class AdaptiveMusicManager : MonoBehaviour
    {
        public static AdaptiveMusicManager Instance { get; private set; }

        [Header("Profile & Playback")]
        public AdaptiveMusicProfile musicProfile;
        [Range(0f, 1f)] public float masterVolume = 0.85f;
        [Range(0f, 1f)] public float intensity = 0.5f;
        public float crossfadeSpeed = 2.5f;
        public bool playOnStart = true;

        [Header("Unity Events")]
        public UnityEvent<int> OnBeat;
        public UnityEvent<int> OnBar;
        public UnityEvent<string> OnSectionChanged;
        public UnityEvent<string> OnTransitionStarted;

        public event Action<int> BeatTriggered;
        public event Action<int> BarTriggered;

        private AdaptiveMusicManifestData _manifest;
        private SectionManifestEntry _currentSection;
        private SectionManifestEntry _pendingSection;
        private readonly List<AudioSource> _activeSources = new List<AudioSource>();
        private readonly List<AudioSource> _stingerSources = new List<AudioSource>();

        private double _sectionStartDspTime;
        private double _pendingSwitchDspTime = -1;
        private int _lastBeatIndex = -1;
        private int _lastBarIndex = -1;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Start()
        {
            if (musicProfile == null) return;
            _manifest = musicProfile.LoadManifest();
            if (_manifest == null || _manifest.sections.Count == 0) return;

            if (playOnStart)
            {
                var firstLoop = _manifest.sections.Find(s => s.role != "stinger") ?? _manifest.sections[0];
                StartSectionImmediately(firstLoop, 0f);
            }
        }

        private void Update()
        {
            if (_manifest == null || _currentSection == null) return;

            double dspNow = AudioSettings.dspTime;
            double secPerBeat = 60.0 / Math.Max(1.0, _manifest.bpm);

            // Execute quantized section transition
            if (_pendingSection != null && _pendingSwitchDspTime > 0 && dspNow >= _pendingSwitchDspTime - 0.02)
            {
                float resumeTime = 0f;
                if (_pendingSection.keepBeatPosition && _activeSources.Count > 0 && _activeSources[0].clip != null)
                {
                    resumeTime = _activeSources[0].time;
                }
                var next = _pendingSection;
                _pendingSection = null;
                _pendingSwitchDspTime = -1;
                StartSectionImmediately(next, resumeTime);
                return;
            }

            // Beat / Bar event tracking
            double elapsed = Math.Max(0.0, dspNow - _sectionStartDspTime);
            int totalBeat = (int)Math.Floor(elapsed / secPerBeat);
            int barIndex = totalBeat / Math.Max(1, _manifest.beatsPerBar);

            if (totalBeat != _lastBeatIndex)
            {
                _lastBeatIndex = totalBeat;
                OnBeat?.Invoke(totalBeat % Math.Max(1, _manifest.beatsPerBar));
                BeatTriggered?.Invoke(totalBeat);
            }
            if (barIndex != _lastBarIndex)
            {
                _lastBarIndex = barIndex;
                OnBar?.Invoke(barIndex % Math.Max(1, _currentSection.bars));
                BarTriggered?.Invoke(barIndex);
            }

            // Smooth vertical stem volume crossfading
            for (int i = 0; i < _activeSources.Count && i < _currentSection.stems.Count; i++)
            {
                var stem = _currentSection.stems[i];
                float targetGain = ComputeIntensityGain(intensity, stem.intensityMin, stem.intensityMax);
                float dbLinear = Mathf.Pow(10f, stem.volumeDb / 20f);
                float targetVol = Mathf.Clamp01(targetGain * dbLinear * masterVolume);
                _activeSources[i].volume = Mathf.MoveTowards(_activeSources[i].volume, targetVol, Time.deltaTime * crossfadeSpeed);
            }
        }

        public void SetIntensity(float value)
        {
            intensity = Mathf.Clamp01(value);
        }

        public void SetGameState(string stateName)
        {
            if (_manifest == null) return;
            var target = _manifest.sections.Find(s => string.Equals(s.name, stateName, StringComparison.OrdinalIgnoreCase));
            if (target == null || target == _currentSection) return;

            if (_currentSection == null)
            {
                StartSectionImmediately(target, 0f);
                return;
            }

            double dspNow = AudioSettings.dspTime;
            double secPerBeat = 60.0 / Math.Max(1.0, _manifest.bpm);
            double elapsedBeats = Math.Max(0.0, (dspNow - _sectionStartDspTime) / secPerBeat);
            int bpb = Math.Max(1, _manifest.beatsPerBar);
            int loopBeats = Math.Max(bpb, _currentSection.bars * bpb);

            double interval = bpb;
            switch (target.transitionQuantization)
            {
                case "next_beat": interval = 1.0; break;
                case "next_bar": interval = bpb; break;
                case "phrase_4": interval = Math.Min(loopBeats, bpb * 4); break;
                case "end_of_loop": interval = loopBeats; break;
            }

            double posInLoop = elapsedBeats % loopBeats;
            double nextBoundary = Math.Ceiling((posInLoop + 0.05) / interval) * interval;
            double beatsUntilSwitch = Math.Max(0.05, nextBoundary - posInLoop);

            _pendingSection = target;
            _pendingSwitchDspTime = dspNow + beatsUntilSwitch * secPerBeat;
            OnTransitionStarted?.Invoke(target.name);
        }

        public void PlayStinger(string stingerName)
        {
            if (_manifest == null) return;
            var stinger = _manifest.sections.Find(s => string.Equals(s.name, stingerName, StringComparison.OrdinalIgnoreCase));
            if (stinger == null) return;

            double startTime = AudioSettings.dspTime + 0.02;
            foreach (var stem in stinger.stems)
            {
                if (stem.clip == null) continue;
                var src = GetOrCreateStingerSource();
                src.clip = stem.clip;
                src.loop = false;
                src.volume = Mathf.Clamp01(Mathf.Pow(10f, stem.volumeDb / 20f) * masterVolume);
                src.PlayScheduled(startTime);
            }
        }

        private void StartSectionImmediately(SectionManifestEntry section, float startTimeSec)
        {
            foreach (var src in _activeSources)
            {
                src.Stop();
            }
            EnsureSourcePool(_activeSources, section.stems.Count);

            double scheduleTime = AudioSettings.dspTime + 0.04;
            _currentSection = section;
            _sectionStartDspTime = scheduleTime - startTimeSec;
            _lastBeatIndex = -1;
            _lastBarIndex = -1;

            for (int i = 0; i < section.stems.Count; i++)
            {
                var stem = section.stems[i];
                var src = _activeSources[i];
                src.clip = stem.clip;
                src.loop = section.role != "stinger";
                if (stem.clip != null)
                {
                    src.time = Mathf.Repeat(startTimeSec, stem.clip.length);
                    float initGain = ComputeIntensityGain(intensity, stem.intensityMin, stem.intensityMax);
                    float dbLinear = Mathf.Pow(10f, stem.volumeDb / 20f);
                    src.volume = Mathf.Clamp01(initGain * dbLinear * masterVolume);
                    src.PlayScheduled(scheduleTime);
                }
            }

            OnSectionChanged?.Invoke(section.name);
        }

        private float ComputeIntensityGain(float current, float min, float max, float fadeWidth = 0.14f)
        {
            if (min <= 0f && max >= 1f) return 1f;
            float inGain = 1f;
            if (min > 0f)
            {
                inGain = Mathf.InverseLerp(min - fadeWidth * 0.5f, min + fadeWidth * 0.5f, current);
            }
            float outGain = 1f;
            if (max < 1f)
            {
                outGain = 1f - Mathf.InverseLerp(max - fadeWidth * 0.5f, max + fadeWidth * 0.5f, current);
            }
            return Mathf.Clamp01(inGain * outGain);
        }

        private void EnsureSourcePool(List<AudioSource> pool, int count)
        {
            while (pool.Count < count)
            {
                var src = gameObject.AddComponent<AudioSource>();
                src.playOnAwake = false;
                src.spatialBlend = 0f;
                pool.Add(src);
            }
        }

        private AudioSource GetOrCreateStingerSource()
        {
            foreach (var src in _stingerSources)
            {
                if (!src.isPlaying) return src;
            }
            var created = gameObject.AddComponent<AudioSource>();
            created.playOnAwake = false;
            created.spatialBlend = 0f;
            _stingerSources.Add(created);
            return created;
        }
    }
}
`;

export const ADAPTIVE_MUSIC_TRIGGER_ZONE_CS = `using UnityEngine;

namespace TheoryDAW.AdaptiveMusic
{
    /// <summary>
    /// Drop onto any Trigger Collider (e.g. Shack, Tiki Bar, Combat Arena) to switch
    /// game music states, adjust vertical intensity, or fire a stinger when the player enters.
    /// </summary>
    [RequireComponent(typeof(Collider))]
    public class AdaptiveMusicTriggerZone : MonoBehaviour
    {
        public string playerTag = "Player";

        [Header("On Enter")]
        public string enterStateName = "Combat";
        public bool overrideIntensity = true;
        [Range(0f, 1f)] public float enterIntensity = 0.85f;
        public string enterStingerName = "";

        [Header("On Exit (Optional)")]
        public string exitStateName = "Exploration";
        [Range(0f, 1f)] public float exitIntensity = 0.25f;

        private void Reset()
        {
            var col = GetComponent<Collider>();
            if (col != null) col.isTrigger = true;
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!other.CompareTag(playerTag) || AdaptiveMusicManager.Instance == null) return;
            if (!string.IsNullOrEmpty(enterStateName))
                AdaptiveMusicManager.Instance.SetGameState(enterStateName);
            if (overrideIntensity)
                AdaptiveMusicManager.Instance.SetIntensity(enterIntensity);
            if (!string.IsNullOrEmpty(enterStingerName))
                AdaptiveMusicManager.Instance.PlayStinger(enterStingerName);
        }

        private void OnTriggerExit(Collider other)
        {
            if (!other.CompareTag(playerTag) || AdaptiveMusicManager.Instance == null) return;
            if (!string.IsNullOrEmpty(exitStateName))
                AdaptiveMusicManager.Instance.SetGameState(exitStateName);
            if (overrideIntensity)
                AdaptiveMusicManager.Instance.SetIntensity(exitIntensity);
        }
    }
}
`;

export function generateUnityReadme(projectName: string): string {
  return `# TheoryDAW Unity Adaptive Music Package — ${projectName}

Compatible with **Unity 2022 LTS** and **Unity 6**.

## Quick Setup (3 Minutes)
1. Unzip this folder into your Unity project under \`Assets/Audio/${projectName.replace(/[^a-zA-Z0-9_-]+/g, '_')}/\`.
2. In Unity's Project window, right-click → **Create → TheoryDAW → Adaptive Music Profile**.
3. Drag \`music_manifest.json\` into the profile's **Manifest Json** slot.
4. Select all \`.wav\` files in \`AudioStems/\` and drag them into the profile's **Stem Clips** list.
   - *Tip:* In Unity's AudioClip import settings for looping stems, set **Load Type = Decompress On Load** (or Compressed In Memory) for zero-latency \`PlayScheduled\` loops.
5. Create an empty GameObject named \`AdaptiveMusicManager\`, attach \`AdaptiveMusicManager.cs\`, and assign your **Adaptive Music Profile**.

## Calling From Your Game Code
\`\`\`csharp
using TheoryDAW.AdaptiveMusic;

// Switch states cleanly on the next bar/beat (or phase-locked for location swaps!)
AdaptiveMusicManager.Instance.SetGameState("Combat");

// Smoothly fade vertical stem layers in/out (0.0 to 1.0)
AdaptiveMusicManager.Instance.SetIntensity(0.85f);

// Fire a one-shot stinger on top of the active loop
AdaptiveMusicManager.Instance.PlayStinger("Victory_Stinger");
\`\`\`

## Trigger Zones (e.g. Entering a Shack or Tiki Bar)
Attach \`AdaptiveMusicTriggerZone.cs\` to any BoxCollider (\`Is Trigger = true\`) and set \`enterStateName\` to your section name!
`;
}
