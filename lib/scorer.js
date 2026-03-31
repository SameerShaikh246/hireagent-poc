export function scoreCandidate(candidate, jd) {
  let score = 0;

  const matchedSkills = candidate.skills.filter(skill =>
    jd.requiredSkills.includes(skill)
  );

  score += matchedSkills.length * 5;

  if (candidate.experience >= jd.minExperience) {
    score += 20;
  }

  return score;
}