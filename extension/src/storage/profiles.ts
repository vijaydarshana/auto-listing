import type { Profile } from '../types';

const STORAGE_KEY = 'auto_listing_profiles';

export async function getProfiles(): Promise<Profile[]> {

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const storedProfiles = result as { [STORAGE_KEY]?: Profile[] };

  return storedProfiles[STORAGE_KEY] || [];
}


export async function saveProfile(profile: Profile) {

  const profiles = await getProfiles();

  const existingIndex = profiles.findIndex(
    p => p.id === profile.id
  );

  if (existingIndex >= 0) {

    profiles[existingIndex] = profile;

  } else {

    profiles.push(profile);

  }

  await chrome.storage.local.set({
    [STORAGE_KEY]: profiles
  });
}


export async function deleteProfile(id: string) {

  const profiles = await getProfiles();

  const updated = profiles.filter(
    profile => profile.id !== id
  );

  await chrome.storage.local.set({
    [STORAGE_KEY]: updated
  });
}