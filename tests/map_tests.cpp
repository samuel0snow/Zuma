#include "zuma_api.hpp"
#include <cmath>
#include <iostream>
#include <stdexcept>
using namespace zuma;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
Point towards(Point a,Point b){return {b.x-a.x,b.y-a.y};}
Json command(const Json& state,const std::string& id){return {{"sessionId",state["sessionId"]},{"version",state["version"]},{"requestId",id}};}
int main(){try{
    const auto line=makeMap("straight",12);
    const auto p=line.slot(2);
    auto center=resolveAim(line,6,towards(line.launcher,p));
    check(center.kind=="ball"&&center.position==4,"center divider chooses forward side");
    const auto a=line.slot(4),b=line.slot(5);
    auto gap=resolveAim(line,6,towards(line.launcher,{(a.x+b.x)/2,a.y}));
    check(gap.kind=="gap"&&gap.position==6,"adjacent center segment fills gap");
    auto miss=resolveAim(line,6,{0,1});
    check(miss.kind=="spit"&&std::abs(miss.impact.y-(line.height-line.diameter/2))<1e-6,"spit stops at leading-edge boundary");
    check(resolveAim(line,0,{0,-1}).kind=="spit","empty track spits");
    check(resolveAim(line,6,towards(line.launcher,{p.x-20,p.y})).position==3,"negative divider side");
    check(resolveAim(line,6,towards(line.launcher,{p.x+20,p.y})).position==4,"positive divider side");
    for(const std::string mapId:{"straight","spiral","s"})for(std::size_t capacity:{12,15}){
        const auto map=makeMap(mapId,capacity);
        for(std::size_t i=0;i<capacity+2;++i){const auto point=map.slot(i);
            check(point.x>=map.diameter/2&&point.x<=map.width-map.diameter/2&&point.y>=map.diameter/2&&point.y<=map.height-map.diameter/2,"all occupied and overflow slots inside stage");
        }
        check(map.pitch==map.diameter*1.5&&map.safetyMargin==map.diameter,"geometry retains diameter ratios");
        if(mapId=="spiral") {
            check(map.diameter==44,"spiral uses smaller balls");
            double sweep=0;
            for(std::size_t i=1;i<map.path.size();++i) {
                const auto a=towards(map.launcher,map.path[i-1]),b=towards(map.launcher,map.path[i]);
                sweep+=std::atan2(a.x*b.y-a.y*b.x,a.x*b.x+a.y*b.y);
            }
            check(sweep>=4*3.141592653589793,"spiral winds at least two complete turns");
            // Check actual lane separation, including the closest slanted samples.
            const int lap=static_cast<int>((map.path.size()-1)/2.15);
            for(int i=0;i+lap+8<static_cast<int>(map.path.size());++i)for(int offset=-8;offset<=8;++offset) {
                const auto a=map.path[i],b=map.path[i+lap+offset];
                check(std::hypot(a.x-b.x,a.y-b.y)>=2*map.diameter,"spiral lanes retain one ball diameter of edge clearance");
            }
        } else check(map.diameter==68,"other maps retain ball diameter");
        check(std::hypot(map.path.front().x-map.path.back().x,map.path.front().y-map.path.back().y)>map.diameter,"open endpoints do not wrap");
        // Ball and gap targets jointly occlude the next row on curved maps.
        bool blocked=false;
        if(mapId!="straight")for(std::size_t i=0;i+1<capacity;++i){
            const auto a=map.slot(i),b=map.slot(i+1);
            const auto result=resolveAim(map,capacity,towards(map.launcher,{(a.x+b.x)/2,(a.y+b.y)/2}));
            if(result.kind!="spit"&&result.targetIndex!=i&&result.targetIndex!=i+1)blocked=true;
        }
        if(mapId=="s")check(blocked,"front S gap occludes rear row");
        for(bool special:{false,true}){
            const Level level{"RRBBRR","GBYPRGBGYRBPYG",{'B','B','G'},capacity};
            GameApi api([level](int){return level;},true);
            auto ready=api.handle("GET","/api/game").body["state"],create=command(ready,"create");
            create.update({{"levelId",1},{"specialsEnabled",special},{"seed",123},{"mapId",mapId}});
            const auto created=api.handle("POST","/api/game",create);
            check(created.status==200&&created.body["state"]["mapId"]==mapId,"create map and mode");
            const auto state=created.body["state"];
            auto invalid=command(state,"zero");invalid.update({{"type","shoot"},{"direction",{{"x",0},{"y",0}}}});
            check(api.handle("POST","/api/action",invalid).status==400,"reject zero direction");
            check(api.handle("GET","/api/game").body["state"]==state,"invalid aim leaves state unchanged");
            auto shot=command(state,"spit");shot.update({{"type","shoot"},{"direction",{{"x",0},{"y",1}}}});
            // Use a guaranteed no-hit direction for each map (search from server geometry).
            bool found=false;
            for(int i=0;i<720;++i){const double angle=i*3.141592653589793/360;
                Point d{std::cos(angle),std::sin(angle)};
                if(resolveAim(map,6,d).kind=="spit"){shot["direction"]={{"x",d.x},{"y",d.y}};found=true;break;}
            }
            check(found,"map exposes at least one miss direction");
            const auto result=api.handle("POST","/api/action",shot);
            Game core(level,{special?30U:0U,123,{}});core.discard();
            const auto expected=snapshotJson(core.snapshot());
            check(result.status==200,"spit accepted");
            for(auto it=expected.begin();it!=expected.end();++it)check(result.body["state"][it.key()]==it.value(),"spit exactly equals discard settlement");
            check(result.body["events"][0]["type"]=="spit"&&result.body["historyEntry"]["action"]=="spit","spit trace and recap metadata");
            check(result.body["historyEntry"]["mapId"]==mapId&&!result.body["historyEntry"]["aim"].is_null(),"map and aim preserved in actual recap");
            check(api.handle("POST","/api/action",shot).body==result.body,"aimed action idempotence");
        }
    }
    std::cout<<"Map geometry, gap occlusion, divider sides, clipping, spit/discard equivalence, replay and validation passed.\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;} }
