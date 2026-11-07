import assert from 'node:assert/strict';
import { test } from 'node:test';
import { surveyDefinition, surveyAnswers, surveyResults } from '../../lib/rice-basket/survey.mjs';

const definition=()=>({title:'새 문항',description:'',questions:[
  {id:'qmulti',title:'여러 항목',type:'multiple',required:true,options:[' A ','B','C']},
  {id:'qscale',title:'자신감',type:'scale',required:true,options:[]},
  {id:'qchoice',title:'하나 선택',type:'choice',required:false,options:['X','Y']},
  {id:'qtext',title:'의견',type:'text',required:false,options:[]},
]});

test('복수 선택은 객관식과 같은 선택지 검증을 쓰고 5점 척도는 고정 범위를 사용한다',()=>{
  const survey=surveyDefinition(definition());
  assert.deepEqual(survey.questions[0].options,['A','B','C']);
  assert.deepEqual(survey.questions[1].options,[]);
  for(const options of [[],['하나'],['같음',' 같음 '],['','둘'],Array(11).fill('선택')]){
    const invalid=definition();invalid.questions[0].options=options;
    assert.throws(()=>surveyDefinition(invalid),TypeError);
  }
});

test('복수 선택 배열과 척도 점수는 기존 객관식·주관식 답변과 함께 보존한다',()=>{
  const survey=surveyDefinition(definition());
  assert.deepEqual(surveyAnswers(survey,{qmulti:[' A ','C'],qscale:' 4 ',qchoice:'X',qtext:' 의견 '}),{qmulti:['A','C'],qscale:'4',qchoice:'X',qtext:'의견'});
  survey.questions.forEach(q=>q.required=false);
  assert.deepEqual(surveyAnswers(survey,{}),{qmulti:[],qscale:'',qchoice:'',qtext:''});
});

test('필수 복수 선택의 누락·중복·없는 선택지·배열이 아닌 응답을 거부한다',()=>{
  const survey=surveyDefinition(definition());
  for(const answer of [[],undefined,'A',['A','A'],['A',' A '],['D'],[1],['A','B','C','A'],{}]){
    assert.throws(()=>surveyAnswers(survey,{qmulti:answer,qscale:'4'}),TypeError);
  }
  assert.throws(()=>surveyAnswers(survey,{qmulti:['A'],qscale:'4',unknown:'답변'}),TypeError);
});

test('5점 척도는 브라우저가 보낸 1~5 문자열만 허용한다',()=>{
  const survey=surveyDefinition(definition());
  for(const score of ['1','2','3','4','5'])assert.equal(surveyAnswers(survey,{qmulti:['A'],qscale:score}).qscale,score);
  for(const score of ['',undefined,'0','6','1.5','-1','NaN','2e0','01',4,[],{}])assert.throws(()=>surveyAnswers(survey,{qmulti:['A'],qscale:score}),TypeError);
});

test('복수 선택은 응답 단위로 집계하고 척도 평균은 미응답을 제외한다',()=>{
  const survey={...surveyDefinition(definition()),responses:[
    {answers:{qmulti:['A','B'],qscale:'5',qchoice:'X',qtext:'첫 의견'}},
    {answers:{qmulti:['B'],qscale:'3',qchoice:'Y',qtext:''}},
    {answers:{qmulti:[],qscale:'',qchoice:'X',qtext:'둘째 의견'}},
  ]};
  const original=JSON.stringify(survey),results=surveyResults(survey);
  assert.equal(results.total,3);
  assert.equal(results.questions[0].answered,2);
  assert.deepEqual(results.questions[0].options.map(o=>o.count),[1,2,0]);
  assert.equal(results.questions[1].answered,2);assert.equal(results.questions[1].average,4);
  assert.deepEqual(results.questions[1].options.map(o=>o.count),[0,0,1,0,1]);
  assert.deepEqual(results.questions[2].options.map(o=>o.count),[2,1]);
  assert.deepEqual(results.questions[3].texts,['첫 의견','둘째 의견']);
  assert.equal(JSON.stringify(survey),original);
  survey.responses=[];
  const empty=surveyResults(survey);
  assert.equal(empty.questions[1].average,null);
  assert.equal(empty.questions[0].answered,0);
});
