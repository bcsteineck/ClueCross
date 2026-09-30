// Deterministic development/test candidate source: no network, no
// credentials, no model. It returns the same Dogs-themed response for any
// request (it doesn't interpret the clue or settings), shaped like
// untrusted provider output so the whole review pipeline is exercised:
//   - ordinary single-word candidates across several categories
//   - multi-word candidates ("Great Dane", "Border Collie", "Dog Park")
//   - an exact construction-form duplicate ("great-dane" → GREATDANE)
//   - a mechanically invalid answer ("St. Bernard": the period isn't A–Z)
//   - singular/plural conflicts ("Puppy"/"Puppies", "Dog Park"/"Dog Parks")
//   - a morphological variant ("Walk"/"Walking")
//   - one structurally malformed candidate (no rationale), dropped as a
//     sourcing issue

import type { CandidateSource } from './contract'

const c = (answer: string, category: string, rationale: string) => ({ answer, category, rationale })

export const FIXTURE_SOURCING_RESPONSE = {
  candidates: [
    c('Beagle', 'Breeds', 'A beagle is a popular scent-hound dog breed.'),
    c('Poodle', 'Breeds', 'A poodle is a well-known dog breed.'),
    c('Great Dane', 'Breeds', 'The Great Dane is a giant dog breed.'),
    c('Border Collie', 'Breeds', 'The Border Collie is a herding dog breed.'),
    c('Corgi', 'Breeds', 'A corgi is a short-legged herding dog breed.'),
    c('Dachshund', 'Breeds', 'A dachshund is a long-bodied dog breed.'),
    c('great-dane', 'Breeds', 'The Great Dane is one of the tallest dog breeds.'),
    c('St. Bernard', 'Breeds', 'The St. Bernard is a large rescue dog breed.'),
    c('Mutt', 'Breeds', 'A mutt is a dog of mixed breed.'),
    c('Puppy', 'Life stages', 'A puppy is a young dog.'),
    c('Puppies', 'Life stages', 'Puppies are young dogs.'),
    c('Paw', 'Anatomy', 'A paw is a dog’s foot.'),
    c('Tail', 'Anatomy', 'Dogs wag their tails.'),
    c('Snout', 'Anatomy', 'A snout is a dog’s nose and mouth.'),
    c('Fur', 'Anatomy', 'Most dogs are covered in fur.'),
    c('Bark', 'Behavior', 'Barking is the sound a dog makes.'),
    c('Howl', 'Behavior', 'Dogs howl to communicate.'),
    c('Wag', 'Behavior', 'Dogs wag their tails when excited.'),
    c('Fetch', 'Behavior', 'Fetch is a classic game played with dogs.'),
    c('Pack', 'Behavior', 'Dogs are pack animals.'),
    c('Sit', 'Training', '“Sit” is a basic dog training command.'),
    c('Stay', 'Training', '“Stay” is a basic dog training command.'),
    c('Heel', 'Training', '“Heel” is a dog training command to walk alongside.'),
    c('Trick', 'Training', 'Dogs are taught tricks.'),
    c('Walk', 'Care', 'Dogs need to be walked daily.'),
    c('Walking', 'Care', 'Walking is part of daily dog care.'),
    c('Groom', 'Care', 'Dogs are groomed to keep their coats healthy.'),
    c('Bone', 'Care', 'Dogs chew on bones.'),
    c('Treat', 'Care', 'Treats reward a dog during training.'),
    c('Leash', 'Equipment', 'A leash keeps a dog under control on walks.'),
    c('Collar', 'Equipment', 'A dog wears a collar with its tags.'),
    c('Crate', 'Equipment', 'A crate is a secure space for a dog.'),
    c('Kennel', 'Equipment', 'A kennel houses a dog.'),
    { answer: 'Harness', category: 'Equipment' },
    c('Dog Park', 'Places', 'A dog park is a fenced area where dogs play off leash.'),
    c('Dog Parks', 'Places', 'Dog parks are fenced areas for dogs.'),
  ],
}

export const fixtureCandidateSource: CandidateSource = {
  // A fresh copy per call, as a real provider would return fresh JSON.
  generate: () => Promise.resolve(JSON.parse(JSON.stringify(FIXTURE_SOURCING_RESPONSE))),
}
