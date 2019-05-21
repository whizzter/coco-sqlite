
let sqlite=require("sqlite3");

let init=(name,...opts)=>{
	let db=new sqlite.Database(name,opts);

	let tableInfoCache=new Map();

	let cacheGet=async (tableName)=>{
		// use existing if in cache.
		if (tableInfoCache.has(tableName)) {
			return tableInfoCache.get(tableName);
		}

		// our info-object that goes into the cache
		let info={};

		// query for a table-description
		let tdesc=await ifobj.query("PRAGMA table_info("+tableName+")");
		//console.log(tdesc.rows);

		// store the columns in the info-entry
		info.columns=tdesc.rows;

		// add a flag to signify if we can use auto-rowid's (and thus ignore missing PK columns for insert)
		info.autopk=1===tdesc.rows
			.map( (col)=>(!col.pk?0:col.type==="INTEGER"?1:2) )   // primary integer keys adds a 1, other keys adds 2 (disqualifies them from being rowID keys) 
			.reduce((a,b)=>a+b,0);                                // accumulate PK's weights, non-int pk's and multiple int pk's will go over 1 and flag that we cannot do auto-rowid's

		// pick any PK name (it will only be valid/useful in case the above check succeeded)
		info.rowid=tdesc.rows.reduce( (a,i)=>i.pk?i.name:a,null );
		// pick a list of public keys
		info.pks=tdesc.rows.reduce( (a,i)=>i.pk?[...a,i.name]:a, []);

		let jsTypes={TEXT:["string"],"INTEGER":["number"],"BOOLEAN":["boolean","number"]};

		// produce type checking and update functions for each C_UD query type
		for (let op of [{o:"create",pk:false},{o:"update",pk:true},{o:"delete",pk:true}]) {
			let needPK=op.pk|| !info.autopk;
			let vCode="";
			for (let col of info.columns) {
				//console.log(op.o,needPK,col);
				if (jsTypes[col.type]) {
					for (let jsType of jsTypes[col.type]) {
						vCode+=`if ("${jsType}"!==typeof v.${col.name})`
					}
					if (col.pk && !needPK) {
						vCode+="/* NO NEED OF PK for "+col.name+"*/ mpkCount++;\n";
					} else {
						vCode+=`throw new Error("Property ${col.name} is missing ${jsTypes[col.type][0]}");\n`
					}
				} else {
					throw new Error("Error, unknown SQLite type "+col.type+" on table:"+tableName+" col:"+col.name);
				}
				//}
			}
			let opsrc="if I N V A L I D";
			let checkSrc="";
			switch(op.o) {
			case "create" : {
					// base case
					checkSrc=`if (mpkCount!==${info.pks.length} && mpkCount!==0) throw new Error("Either ALL or NONE of the PK fields needs to be present!");`;
					opsrc="";
					for (let i=0;i<2;i++) {
						if (i===0)
							opsrc+=`if (mpkCount===0)\n`
						else
							opsrc+='else\n';
						let columns=info.columns.filter(col=>i==0?true:!info.pks.find(pk=>pk===col.name));
						opsrc+=`await ifobj.query("INSERT INTO ${tableName} (${ columns.map(col=>"'"+col.name+"'").join(',') }) VALUES (${ columns.map(col=>'?').join(',') });", ${ columns.map(col=>"v."+col.name).join(',') } );\n`;
					}
				} break;
			case "update" : {
					let dcolumns=info.columns.filter(col=>!info.pks.find(pk=>pk===col.name));
					opsrc=`await ifobj.query("UPDATE ${tableName} SET ${ dcolumns.map(col=>col.name+"=?").join(',') } WHERE ${ info.pks.map(pkn=>pkn+"=?").join(' AND ') } ", ${ dcolumns.map(col=>"v."+col.name).join(',') }, ${ info.pks.map(pkn=>"v."+pkn).join(',') } );`
				} break;
			case "delete" :
				opsrc=`await ifobj.query("DELETE FROM ${tableName} WHERE ${ info.pks.map(pkn=>pkn+"=?").join(' AND ') } ", ${ info.pks.map(pkn=>"v."+pkn).join(',') } );`;
				break;
			default:
				throw new Error("Internal error");
			}
			let fnsrc=info[op.o+"src"]=`async (ifobj,objs,checkfn)=>{ let mpkCount=0;\n for (let v of objs) {\n ${vCode}\n if (checkfn) if (!checkfn(v)) throw new Error("Checkfn failed for object on ${tableName}");  }\n ${checkSrc}\n ifobj=await ifobj.begin();\n try {\n for (let v of objs) {\n ${opsrc}\n }\n await ifobj.commit();\n } catch (e) {\n await ifobj.rollback();\n  throw e;\n }\n return true;  }`;
			info[op.o+"fn"]=eval(fnsrc);
		}

		//console.log(info);
		tableInfoCache.set(tableName,info);
		return info;
	};

	let ifobj={

		begin: async ()=>{
			return ifobj;
		},
		commit: async()=>{},
		rollback: async()=>{},

		query(qs,...args) {
			let rejfn;
			let resfn;
			
			db.all(qs,...args,(err,rows)=>{
				if (err) {
					rejfn(new Error(err));
				} else {
					resfn({rowCount:rows.length,rows});
				}
			});

			return new Promise(function(res,rej) {
				rejfn=rej;
				resfn=res;
			});
		},
		
		create:async (tableName,args, checkfn)=>{
			// the default code works with multiple keys and objects, so wrap single values in arrays
			args=args instanceof Array?args:[args];
			let info=await cacheGet(tableName);
			return await info.createfn(ifobj,args, checkfn);
		},
		update:async (tableName,args, checkfn)=>{
			// the default code works with multiple keys and objects, so wrap single values in arrays
			args=args instanceof Array?args:[args];
			let info=await cacheGet(tableName);
			return await info.updatefn(ifobj,args, checkfn);
		},
		delete:async (tableName,args, checkfn)=>{
			// the default code works with multiple keys and objects, so wrap single values in arrays
			args=args instanceof Array?args:[args];
			let info=await cacheGet(tableName);
			return await info.deletefn(ifobj,args, checkfn);
		},
	};
	
	return ifobj;
};

// add this to be compatible with ES6 modules
init.default=init;

module.exports=init;

