import test from "node:test";
import assert from "node:assert/strict";
import {publishedZones,publishedZone,reviewDecision} from "../src/upload.js";
import {validarZona} from "../src/reservas.js";

const uploadId="a".repeat(32);
const row={
  upload_id:uploadId,zone_key:"SP-71072-0252",uf:"SP",municipio:"71072",zona:"0252",
  municipio_nome:"São Paulo",expected_sections:1,
  contributor_id:42,contributor_login:"JuniorNarciso26",submitted_at:1793200000,
  reviewer_id:7,reviewer_login:"JuniorNarciso26",reviewed_at:1793203600,state:"published",
  meta_json:JSON.stringify({uf:"SP",municipio:"71072",zona:"0252",total_secoes:1,cobertura_completa:true}),
  summary_json:JSON.stringify({meta:{secao:"RESUMO"},turnos:{"1":{},"2":{}}})
};

function db(initial=row){
  const item={...initial};
  return {item,DB:{
    prepare(sql){
      let values=[];
      return {
        bind(...args){values=args;return this;},
        async all(){
          if(sql.includes("FROM zone_upload_sections"))return {results:[{section_json:JSON.stringify({meta:{secao:"0001"}})}]};
          if(sql.includes("WHERE u.state='published'"))return {results:item.state==="published"?[item]:[]};
          throw Error("Unexpected all: "+sql);
        },
        async first(){
          if(sql.includes("FROM zone_uploads u LEFT JOIN users reviewer"))return item.state==="published"?item:null;
          if(sql.includes("SELECT zone_key,state FROM zone_uploads"))return {zone_key:item.zone_key,state:item.state};
          throw Error("Unexpected first: "+sql);
        }
      };
    },
    async batch(queries){
      throw Error("Unexpected batch");
      return [];
    }
  }};
}

test("a zona publicada expõe login e datas de quem coletou e revisou, sem IDs internos",async()=>{
  const env=db();
  const list=await publishedZones(env);
  assert.equal(list.length,1);
  assert.deepEqual(list[0].auditoria,{
    processado_por:"JuniorNarciso26",enviado_em:1793200000,
    revisado_por:"JuniorNarciso26",revisado_em:1793203600
  });
  assert.equal(list[0].auditoria.reviewer_id,undefined);
  const single=await publishedZone(env,validarZona({uf:"SP",municipio:"71072",zona:"0252"}));
  assert.equal(single.secoes.length,1);
  assert.deepEqual(single.auditoria,list[0].auditoria);
  assert.doesNotMatch(JSON.stringify(single),/"contributor_id"|"reviewer_id"|"review_reason"/);
});
test("contas diferentes são preservadas na publicação",async()=>{
  const env=db({...row,contributor_login:"coletor-alfa",reviewer_login:"revisor-beta"});
  const one=await publishedZones(env);
  assert.equal(one[0].auditoria.processado_por,"coletor-alfa");
  assert.equal(one[0].auditoria.revisado_por,"revisor-beta");
});
test("publicação legada preserva ausência de revisor, sem atribuir autoria falsa",async()=>{
  const env=db({...row,reviewer_login:null,reviewed_at:null});
  const one=await publishedZones(env);
  assert.equal(one[0].auditoria.revisado_por,null);
  assert.equal(one[0].auditoria.revisado_em,null);
});
test("uma decisão armazena ID e snapshot do login do revisor",async()=>{
  const env=db({...row,state:"pending_review",reviewer_login:null,reviewed_at:null});
  const recorded=[];
  env.DB.batch=async statements=>{
    recorded.push(...statements);
    return [{results:[{upload_id:uploadId}]},{results:[]}];
  };
  // Captura os bindings do D1 para confirmar que o ID e o login são gravados
  const prepare=env.DB.prepare;
  env.DB.prepare=(sql)=>{
    const statement=prepare(sql);
    statement.sql=sql;
    const bind=statement.bind;
    statement.bind=function(...args){this.values=args;return bind.apply(this,args);};
    return statement;
  };
  const reviewer={id:7,login:"JuniorNarciso26"};
  const result=await reviewDecision(env,{upload_id:uploadId,decision:"approve"},reviewer,1793203600);
  assert.equal(result.state,"published");
  assert.match(recorded[0].sql,/SET state=\?,reviewer_id=\?,reviewer_login=\?,reviewed_at=\?/);
  assert.deepEqual(recorded[0].values,["published",7,"JuniorNarciso26",1793203600,"",uploadId]);
});
