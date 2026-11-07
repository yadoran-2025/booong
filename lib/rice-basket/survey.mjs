function text(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max; }

export function surveyDefinition(body) {
  if (!body || !text(body.title, 120)) throw new TypeError('설문 제목을 120자 이내로 입력해 주세요.');
  if (typeof body.description !== 'string' || body.description.length > 1000) throw new TypeError('설문 소개를 1000자 이내로 입력해 주세요.');
  if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 20) throw new TypeError('문항을 1~20개 작성해 주세요.');
  const ids = new Set();
  const questions = body.questions.map(question => {
    if (!question || typeof question.id !== 'string' || !/^q[a-z0-9_-]{1,39}$/.test(question.id) || ids.has(question.id)) throw new TypeError('문항 번호가 올바르지 않습니다.');
    ids.add(question.id);
    if (!text(question.title, 200) || !['choice', 'multiple', 'scale', 'text'].includes(question.type) || typeof question.required !== 'boolean') throw new TypeError('문항 제목·유형·필수 여부를 확인해 주세요.');
    let options = [];
    if (question.type === 'choice' || question.type === 'multiple') {
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 10 || !question.options.every(option => text(option, 160))) throw new TypeError('객관식 선택지를 2~10개, 각각 160자 이내로 작성해 주세요.');
      options = question.options.map(option => option.trim());
      if (new Set(options).size !== options.length) throw new TypeError('같은 선택지를 중복해서 넣을 수 없습니다.');
    }
    return { id: question.id, title: question.title.trim(), type: question.type, required: question.required, options };
  });
  return { title: body.title.trim(), description: body.description.trim(), questions };
}

export function surveyAnswers(survey, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(id => !survey.questions.some(question => question.id === id))) throw new TypeError('응답 형식이 올바르지 않습니다.');
  return Object.fromEntries(survey.questions.map(question => {
    if (question.type === 'multiple') {
      const answer = input[question.id] ?? [];
      if (!Array.isArray(answer) || answer.length > question.options.length || !answer.every(value => typeof value === 'string')) throw new TypeError('복수 선택 응답 형식이 올바르지 않습니다.');
      const values = answer.map(value => value.trim());
      if (question.required && !values.length) throw new TypeError(`필수 문항에 하나 이상 선택해 주세요: ${question.title}`);
      if (new Set(values).size !== values.length || values.some(value => !question.options.includes(value))) throw new TypeError('복수 선택의 선택지를 확인해 주세요.');
      return [question.id, values];
    }
    const answer = input[question.id] ?? '';
    if (typeof answer !== 'string' || answer.length > 1000) throw new TypeError('주관식 응답은 1000자 이내로 작성해 주세요.');
    const value = answer.trim();
    if (question.required && !value) throw new TypeError(`필수 문항에 응답해 주세요: ${question.title}`);
    if (question.type === 'choice' && value && !question.options.includes(value)) throw new TypeError('객관식 선택지를 확인해 주세요.');
    if (question.type === 'scale' && value && !/^[1-5]$/.test(value)) throw new TypeError('5점 척도는 1~5점 중 하나를 선택해 주세요.');
    return [question.id, value];
  }));
}

export function surveyResults(survey) {
  return {
    title: survey.title, total: survey.responses.length, open: survey.open, revision: survey.revision,
    questions: survey.questions.map(question => {
      const values = survey.responses.map(response => response.answers[question.id]).filter(value => question.type === 'multiple' ? Array.isArray(value) && value.length > 0 : Boolean(value));
      const options = question.type === 'scale' ? ['1', '2', '3', '4', '5'] : question.options;
      return {
        id: question.id, title: question.title, type: question.type, answered: values.length,
        options: options.map(label => ({ label, count: values.filter(value => question.type === 'multiple' ? value.includes(label) : value === label).length })),
        texts: question.type === 'text' ? values : [],
        ...(question.type === 'scale' ? { average: values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null } : {}),
      };
    }),
  };
}
